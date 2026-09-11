"""FastAPI 앱 — contracts/api_contract.md v0.4 구현. 얇은 라우팅 껍데기.

모든 로직은 fastapi 없이 도는 헬퍼(api/service·serialize·presets·jobs·auth·auth_service)에 있다.
그래서 엔진·테스트는 fastapi 없이 돌고, 이 파일은 HTTP↔헬퍼 배선만 한다.

★ 이 파일에 `from __future__ import annotations` 를 넣지 마라.
  Request 를 create_app() 안에서 import 하고 있어서, 애노테이션이 문자열이 되면 FastAPI 가
  모듈 전역에서 Request 를 못 찾고 **쿼리 파라미터로 오인**한다(2026-08-31 실제로 겪음).

구동: 프로젝트 루트(model/)에서
    uvicorn "joker.api.app:create_app" --factory --port 8000
fastapi 는 optional 의존성이라 함수 안에서 import 한다.
"""

import importlib.util
import secrets


def create_app():
    from fastapi import FastAPI, Request, Response
    from fastapi.responses import JSONResponse

    from joker.api import guest as guest_mod
    from joker.api import presets, serialize, service
    from joker.api.auth_service import AuthService
    from joker.api.jobs import JobRegistry, QueueFull
    from joker.api.admission import consume
    from starlette.concurrency import run_in_threadpool
    from joker.config import Settings, load_dotenv
    from joker.corpus.loader import load_default_corpus
    from joker.store.auth_store import AuthRepository
    from joker.store.sqlite import Repository

    # ★ uvicorn 은 cli.main() 을 안 거치므로 여기서 .env 를 읽는다.
    #   안 하면 JOKER_PROFILE 이 기본값 mock 으로 떨어져 '가짜 응답으로 만든 진짜처럼 보이는 수치'가 나온다.
    load_dotenv()
    settings = Settings.from_env()
    repo = Repository(settings.db_path)
    auth_repo = AuthRepository(settings.db_path)
    auth_service = AuthService(auth_repo)
    registry = JobRegistry()
    data_dir = "data/attacks"

    # ★ 시작할 때 한 번 스키마를 맞춘다(계약 v0.4).
    #   회원 3테이블 + tb_diagnosis.user_id ALTER 가 여기서 적용된다. 안 하면 이미 joker.db 가
    #   깔린 PC 에서 이력 질의가 "no such column: user_id" 로 죽는다.
    # 저장소를 초기화하지 못하면 기동을 실패시킨다. 쓰기 불가능한 상태를 정상으로 노출하지 않는다.
    repo.init_schema()

    from joker.detect_ko import KoDetector
    detector = KoDetector()  # 모델은 첫 /api/detect 호출에서 lazy 로드(엔진 시작은 안 무겁게)

    # 코퍼스는 시작 시 1회 로드해 health 의 corpus_loaded 로 쓴다(진단마다 다시 읽는 건 prepare 담당).
    try:
        _corpus_n = len(load_default_corpus(data_dir, run_audit=False))
    except Exception:  # noqa: BLE001
        _corpus_n = 0

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(_app):
        yield
        registry.shutdown()   # 남은 워커 정리 (jobs.JobRegistry.shutdown 주석 참고)

    app = FastAPI(title="Chat Shield API", version="0.8", lifespan=lifespan)

    # ── 공용 헬퍼 ────────────────────────────────────────────
    def _err_response(prep: dict):
        return JSONResponse(
            status_code=prep["status"],
            content={"error": {"code": prep["code"], "message": prep["message"]}},
        )

    def _error(status: int, code: str, message: str):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})

    def _not_found(run_id: str):
        # ★ 남의 진단에도 이 응답을 준다. 403("있지만 권한 없음")은 그 run_id 가 존재한다는
        #   사실 자체를 알려준다 — 존재 여부도 흘리지 않는 게 IDOR 방어의 기본이다.
        return _error(404, "not_found", "run_id 없음: " + run_id)

    async def _json_body(req):
        """본문 파싱. 실패하면 (None, 400응답)."""
        try:
            chunks = bytearray()
            async for chunk in req.stream():
                chunks.extend(chunk)
                if len(chunks) > 131072:
                    return None, _error(413, "body_too_large", "요청 본문이 너무 큽니다.")
            import json
            body = json.loads(chunks)
            if not isinstance(body, dict):
                return None, _error(400, "bad_json", "JSON 객체가 필요합니다.")
            return body, None
        except Exception:  # noqa: BLE001
            return None, _error(400, "bad_json", "요청 본문이 JSON 이 아닙니다.")

    def _viewer(req):
        """Authorization: Bearer 를 '선택적으로' 읽는다. 없으면 None = 비회원."""
        return auth_service.viewer(req.headers.get("authorization"))

    def _guest_id(req):
        """X-Guest-Token 헤더 → guest_id. 서명이 안 맞거나 서버에 없는 게스트면 None.

        ★ 헤더 이름을 쓴 이유: Streamlit 은 브라우저 쿠키를 우리 손으로 못 만진다.
          화면이 토큰을 들고 다니며 요청마다 붙인다 — 서버가 검증하는 쪽은 그대로다.
        """
        gid = guest_mod.parse_token(req.headers.get("x-guest-token"))
        if gid is None:
            return None
        try:
            return gid if repo.guest_exists(gid) else None
        except Exception:  # noqa: BLE001 — DB 가 아직 없으면 비회원 미식별로 처리
            return None

    def _may_view(owner_id, viewer, run_guest_id=None, req_guest_id=None):
        """이 요청자가 이 진단을 볼 수 있는가.

        ① 회원 소유 진단(owner_id 있음) → 본인만.
        ② 비회원 진단(owner_id None) → **그 진단을 만든 방문자만**.
           ★ 2026-09-10 수정. 예전에는 owner_id 가 None 이면 무조건 True 였다. 즉
             run_id 만 알면 다른 방문자의 체험 진단(고객사 시스템 지시문·보호 자산 이름)이
             그대로 보였다. IDOR 을 회원 자원에만 막고 비회원 자원에는 안 막은 셈이다.
           ★ run 에 guest_id 가 없는 옛 데이터(v0.5 이전)는 방문자를 특정할 수 없다 →
             소유권을 증명할 수 없으므로 웹 열람을 거부한다. 기존 파일을 삭제하지는 않는다.
        """
        if owner_id is not None:
            return viewer is not None and viewer["user_id"] == owner_id
        if viewer is not None:
            # 로그인 상태에서 주인 없는 진단 → 방금 자기가 비회원으로 돌린 그 진단일 때만.
            # (아니면 claim 전에 남의 체험 결과를 회원 화면에서 볼 수 있게 된다.)
            return run_guest_id is not None and run_guest_id == req_guest_id
        if run_guest_id is None:
            return False
        return req_guest_id is not None and run_guest_id == req_guest_id

    def _auth_result(res: dict):
        """AuthService 결과 dict → HTTP 응답."""
        if not res.get("ok"):
            return _err_response(res)
        if res["status"] == 204:
            return Response(status_code=204)  # 204 는 본문이 있으면 안 된다
        return JSONResponse(status_code=res["status"], content=res["body"])

    # ── 회원 ────────────────────────────────────────────────
    @app.post("/api/auth/signup")
    async def signup(req: Request):
        body, err = await _json_body(req)
        if err is not None:
            return err
        return _auth_result(auth_service.signup(body))

    @app.post("/api/auth/login")
    async def login(req: Request):
        body, err = await _json_body(req)
        if err is not None:
            return err
        return _auth_result(auth_service.login(body))

    @app.post("/api/auth/logout")
    def logout(request: Request):
        return _auth_result(auth_service.logout(request.headers.get("authorization")))

    @app.get("/api/me")
    def me(request: Request):
        viewer = _viewer(request)
        if viewer is None:
            return _error(401, "auth_required", "로그인이 필요합니다.")
        return viewer

    # ── 비회원 방문자 세션 ──────────────────────────────────
    @app.post("/api/guest/session")
    def guest_session(request: Request):
        """무료 체험용 게스트 토큰 발급/갱신 (계약 v0.6).

        화면이 토큰을 이미 갖고 있으면 그걸 그대로 확인해 돌려준다(매번 재발급하면 체험
        1회가 초기화되어 정책이 무의미해진다). 없거나 위조면 새로 발급한다.
        """
        gid = _guest_id(request)
        issued = False
        if gid is None:
            gid = guest_mod.new_guest_id()
            issued = True
        ip_hash = guest_mod.hash_ip(
            guest_mod.client_ip(request.headers,
                                request.client.host if request.client else None))
        try:
            repo.init_schema()
            repo.upsert_guest(gid, ip_hash, guest_mod.now_iso())
            q = guest_mod.quota(repo, gid, ip_hash, registry.in_flight_for_guest(gid))
        except Exception:  # noqa: BLE001
            return _error(503, "guest_unavailable", "방문자 세션을 준비하지 못했습니다.")
        return {
            "guest_id": gid, "token": guest_mod.make_token(gid), "issued": issued,
            "free_runs": q,
            # ★ 화면은 이 문장을 그대로 쓴다. 제한 단위를 서버와 화면이 다르게 말하면
            #   '사람당 1회' 같은 지키지 못하는 약속이 화면에만 생긴다.
            "limit_note": ("무료 체험은 이 브라우저에 발급된 방문자 토큰과 접속 회선(IP) 해시를 "
                           "기준으로 1회입니다. 신원 확인을 하지 않으므로 ‘사람당 1회’ 는 "
                           "아닙니다."),
            "running_run_id": registry.running_run_id_for_guest(gid),
        }

    # ── 진단 ────────────────────────────────────────────────
    @app.post("/api/diagnose")
    async def diagnose(req: Request):
        body, err = await _json_body(req)
        if err is not None:
            return err
        viewer = _viewer(req)
        user_id = viewer["user_id"] if viewer else None
        guest_id = None
        if user_id is None:
            # ★ 무료 체험 1회는 비회원 경로에만 적용한다. 회원은 기존 호출 예산·동시 실행
            #   제한(잡 풀 max_workers=1)을 그대로 따른다.
            guest_id = _guest_id(req)
            if guest_id is None:
                return _error(401, "guest_session_required",
                              "무료 체험을 시작하려면 방문자 세션이 필요합니다. "
                              "화면을 새로 불러온 뒤 다시 시도하세요.")
            ip_hash = guest_mod.hash_ip(
                guest_mod.client_ip(req.headers, req.client.host if req.client else None))
            q = guest_mod.quota(repo, guest_id, ip_hash,
                                registry.in_flight_for_guest(guest_id))
            if q["running"]:
                # 새로고침·중복 클릭. 같은 진단이 두 번 시작되지 않게 막고 그 run_id 를 알려준다.
                return JSONResponse(status_code=409, content={"error": {
                    "code": "guest_run_in_progress",
                    "message": "이미 진행 중인 체험 진단이 있습니다. "
                               "그 진단이 끝나면 결과가 열립니다.",
                    "run_id": registry.running_run_id_for_guest(guest_id)}})
            if q["remaining"] <= 0:
                return _error(429, "guest_quota_exhausted",
                              "무료 체험 진단 1회를 이미 사용했습니다. "
                              "무료 회원가입 후 추가 진단을 실행할 수 있습니다.")
        # 사전 연결 검사보다 먼저 자리를 예약한다. 동시에 같은 사용자가 통과할 수 없다.
        reservation = "run_" + secrets.token_hex(16)
        try:
            job = registry.register(reservation, {}, {}, user_id, guest_id)
        except QueueFull:
            return _error(429, "queue_full", "진행 중인 진단이 있거나 대기열이 가득 찼습니다.")
        subject = "user:" + user_id if user_id else "guest-ip:" + (ip_hash or guest_id)
        try:
            if not await run_in_threadpool(consume, settings.db_path, subject):
                registry.discard(reservation)
                return _error(429, "daily_budget_exhausted", "최근 24시간 진단 시도 한도(10회)에 도달했습니다.")
            prep = await run_in_threadpool(service.prepare, body, settings, data_dir,
                                          user_id=user_id, guest_id=guest_id)
        except Exception:
            registry.discard(reservation)
            return _error(503, "prepare_failed", "진단 준비에 실패했습니다. 잠시 후 다시 시도하세요.")
        if not prep.get("ok"):
            registry.discard(reservation)
            return _err_response(prep)
        prep["run_id"] = reservation
        job.target, job.estimated = prep["target"], prep["estimated"]
        registry.submit(prep["run_id"], service.make_worker(prep, repo,
                                                           on_progress=job.note_progress))
        est = prep["estimated"]
        # 202: 시작만 알린다. target 은 model+backend 만(전체는 GET 에서). estimated_calls 는 BYOK 요금 고지.
        return JSONResponse(status_code=202, content={
            "run_id": prep["run_id"], "status": "running",
            "estimated_calls": est["victim_max"],
            "target": {"model": prep["target"]["model"], "backend": prep["target"]["backend"]},
        })

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, request: Request):
        viewer = _viewer(request)
        req_guest = _guest_id(request)
        job = registry.get(run_id)
        if job and job.status == "running":
            if not _may_view(job.user_id, viewer, job.guest_id, req_guest):
                return _not_found(run_id)
            return serialize.running_payload(run_id, job.target, job.estimated, job.progress)
        if job and job.status == "error":
            if not _may_view(job.user_id, viewer, job.guest_id, req_guest):
                return _not_found(run_id)
            return serialize.error_payload(run_id, job.target, job.error)
        # 완료본은 DB 가 진실(레지스트리에 없어도 재시작 후 이력으로 조회된다)
        try:
            run = repo.load_run(run_id)
        except KeyError:
            return _not_found(run_id)
        # ★ IDOR 차단. 이 검사가 없으면 run_id 만 알면 남의 고객사 시스템 지시문이 통째로 보인다.
        #   비회원 진단도 같은 규칙을 받는다(v0.6) — guest_id 가 일치해야 열린다.
        if not _may_view(run.get("user_id"), viewer, run.get("guest_id"), req_guest):
            return _not_found(run_id)
        # ★ 게이팅은 serialize 가 한다 — 비회원 응답에는 처방문 전문·시도별 상세가 애초에 안 담긴다.
        return serialize.serialize_run(run, viewer=viewer)

    @app.get("/api/runs")
    def list_runs(request: Request):
        viewer = _viewer(request)
        def public_rows(rows, pending):
            for row in rows:
                if row.get("privacy_version", 0) < 1:
                    row["persona"] = None
                if row.get("unjudged") or row.get("no_retry"):
                    for key in ("grade", "asr_before", "asr_after", "asr_delta"):
                        row[key] = None
                if not row.get("comparable"):
                    row["grade"] = row["asr_delta"] = None
            existing = {row["run_id"] for row in rows}
            return {"runs": sorted(rows + [r for r in pending if r["run_id"] not in existing],
                                   key=lambda row: row["created_at"], reverse=True)}
        try:
            if viewer:
                return public_rows(repo.list_runs(user_id=viewer["user_id"]),
                                   registry.visible_rows(user_id=viewer["user_id"]))
            # ★ 비회원에게는 '이 방문자가 만든' 체험 진단만. guest_id 가 없으면 빈 목록이다 —
            #   주인 없는 진단 전체를 주면 남의 체험 결과가 목록으로 보인다.
            gid = _guest_id(request)
            if gid is None:
                return {"runs": []}
            return public_rows(repo.list_runs(guest_id=gid), registry.visible_rows(guest_id=gid))
        except Exception:  # noqa: BLE001 — DB 가 아직 없으면 빈 목록
            return {"runs": []}

    @app.post("/api/runs/{run_id}/claim")
    def claim_run(run_id: str, request: Request):
        """비회원으로 돌린 진단을 방금 가입/로그인한 회원 것으로 귀속시킨다.

        ★ 귀속 조건이 두 개다 — 주인이 없어야 하고(user_id IS NULL), **요청자의 게스트
          토큰이 그 진단을 만든 방문자와 같아야** 한다. 두 번째가 없으면 run_id 를 알아낸
          제3자가 남의 체험 결과를 자기 계정으로 가져갈 수 있다.
        """
        viewer = _viewer(request)
        if viewer is None:
            return _error(401, "auth_required", "로그인이 필요합니다.")
        gid = _guest_id(request)
        if gid is None:
            # ★ 게스트 토큰 없이는 귀속하지 않는다. repo.claim_run(guest_id=None) 은 '아무
            #   주인 없는 진단' 을 가져가는 느슨한 경로라 HTTP 층에서는 절대 쓰지 않는다.
            return _not_found(run_id)
        try:
            claimed = repo.claim_run(run_id, viewer["user_id"], guest_id=gid)
        except Exception:  # noqa: BLE001
            claimed = False
        if not claimed:
            # 없거나 / 이미 주인이 있거나 / 내 게스트 진단이 아니다. 어느 쪽인지 구분해 주지 않는다.
            return _not_found(run_id)
        return Response(status_code=204)

    @app.delete("/api/runs/{run_id}")
    def delete_run(run_id: str, request: Request):
        """진단 결과 삭제(개인정보 자기결정권). 본인 소유만."""
        viewer = _viewer(request)
        if viewer is None:
            return _error(401, "auth_required", "로그인이 필요합니다.")
        try:
            deleted = repo.delete_run(run_id, viewer["user_id"])
        except Exception:  # noqa: BLE001
            deleted = False
        if not deleted:
            return _not_found(run_id)  # 남의 것도 '없음'으로 답한다
        return Response(status_code=204)

    # ── 기타 ────────────────────────────────────────────────
    @app.get("/api/models")
    def models():
        from joker.providers.usage import estimate_calls
        return {**presets.list_models(), "estimates": {
            mode: {**estimate_calls(_corpus_n, full=(mode == "full")),
                   "preflight": 1, "configured_limit": settings.max_calls}
            for mode in ("screening", "full")
        }}

    @app.post("/api/detect")
    async def detect(req: Request):
        """입력 문구 1건 → JOKER-KO 공격 탐지. 원문은 응답에 안 담는다(비밀값 유출 방지)."""
        from joker.detect_ko import DetectorUnavailable, detect_payload
        body, err = await _json_body(req)
        if err is not None:
            return err
        try:
            return await run_in_threadpool(detect_payload, detector, (body or {}).get("text"))
        except ValueError as e:
            return _error(400, "text_required", str(e))
        except DetectorUnavailable as e:
            return _error(503, "detector_unavailable", str(e))

    @app.get("/api/health")
    def health():
        lg = importlib.util.find_spec("langgraph") is not None
        return {
            "status": "ok", "profile": settings.profile.value, "langgraph": lg,
            "corpus_loaded": _corpus_n, "default_preset": presets.DEFAULT_PRESET,
            "detector_ready": detector.available(),
        }

    from joker.api.web import mount_web
    mount_web(app)
    return app
