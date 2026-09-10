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


def create_app():
    from fastapi import FastAPI, Request, Response
    from fastapi.responses import JSONResponse

    from joker.api import presets, serialize, service
    from joker.api.auth_service import AuthService
    from joker.api.jobs import JobRegistry
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
    #   읽기 전용 위치여도 앱은 떠야 하므로 실패는 삼킨다(진단 시 make_worker 가 다시 시도한다).
    try:
        repo.init_schema()
    except Exception:  # noqa: BLE001
        pass

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

    app = FastAPI(title="Chat Shield API", version="0.4", lifespan=lifespan)

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
            return await req.json(), None
        except Exception:  # noqa: BLE001
            return None, _error(400, "bad_json", "요청 본문이 JSON 이 아닙니다.")

    def _viewer(req):
        """Authorization: Bearer 를 '선택적으로' 읽는다. 없으면 None = 비회원."""
        return auth_service.viewer(req.headers.get("authorization"))

    def _may_view(owner_id, viewer):
        """owner_id 가 None(비회원 진단)이면 누구나. 아니면 본인만."""
        if owner_id is None:
            return True
        return viewer is not None and viewer["user_id"] == owner_id

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

    # ── 진단 ────────────────────────────────────────────────
    @app.post("/api/diagnose")
    async def diagnose(req: Request):
        body, err = await _json_body(req)
        if err is not None:
            return err
        viewer = _viewer(req)
        user_id = viewer["user_id"] if viewer else None
        prep = service.prepare(body, settings, data_dir, user_id=user_id)
        if not prep.get("ok"):
            return _err_response(prep)
        job = registry.register(prep["run_id"], prep["target"], prep["estimated"],
                                user_id=user_id)
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
        job = registry.get(run_id)
        if job and job.status == "running":
            if not _may_view(job.user_id, viewer):
                return _not_found(run_id)
            return serialize.running_payload(run_id, job.target, job.estimated, job.progress)
        if job and job.status == "error":
            if not _may_view(job.user_id, viewer):
                return _not_found(run_id)
            return serialize.error_payload(run_id, job.target, job.error)
        # 완료본은 DB 가 진실(레지스트리에 없어도 재시작 후 이력으로 조회된다)
        try:
            run = repo.load_run(run_id)
        except KeyError:
            return _not_found(run_id)
        # ★ IDOR 차단. 이 검사가 없으면 run_id 만 알면 남의 고객사 시스템 지시문이 통째로 보인다.
        if not _may_view(run.get("user_id"), viewer):
            return _not_found(run_id)
        # ★ 게이팅은 serialize 가 한다 — 비회원 응답에는 처방문 전문·시도별 상세가 애초에 안 담긴다.
        return serialize.serialize_run(run, viewer=viewer)

    @app.get("/api/runs")
    def list_runs(request: Request):
        viewer = _viewer(request)
        try:
            return {"runs": repo.list_runs(user_id=viewer["user_id"] if viewer else None)}
        except Exception:  # noqa: BLE001 — DB 가 아직 없으면 빈 목록
            return {"runs": []}

    @app.post("/api/runs/{run_id}/claim")
    def claim_run(run_id: str, request: Request):
        """비회원으로 돌린 진단을 방금 가입한 회원 것으로 귀속시킨다(주인 없는 진단만)."""
        viewer = _viewer(request)
        if viewer is None:
            return _error(401, "auth_required", "로그인이 필요합니다.")
        try:
            claimed = repo.claim_run(run_id, viewer["user_id"])
        except Exception:  # noqa: BLE001
            claimed = False
        if not claimed:
            # 없거나 이미 주인이 있는 진단. 어느 쪽인지 구분해 알려주지 않는다.
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
        return presets.list_models()

    @app.post("/api/detect")
    async def detect(req: Request):
        """입력 문구 1건 → JOKER-KO 공격 탐지. 원문은 응답에 안 담는다(비밀값 유출 방지)."""
        from joker.detect_ko import DetectorUnavailable, detect_payload
        body, err = await _json_body(req)
        if err is not None:
            return err
        try:
            return detect_payload(detector, (body or {}).get("text"))
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

    return app
