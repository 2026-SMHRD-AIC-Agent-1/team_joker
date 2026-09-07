"""API 직렬화 — DB/도메인 객체를 contracts/api_contract.md 응답 형태로 바꾼다.

★ fastapi 를 import 하지 않는다 → 브리지(PYTHONPATH=src python3)에서 단위 검증이 된다.
★ 개인정보 설계(SPEC §5)의 실체가 여기 있다:
   - response_excerpt = mask_secrets() 통과 + 절삭. 피해 챗봇 응답에 섞인 진짜 키·PII 를 가린다.
   - patched_prompt 는 '마스킹하지 않는다' — PATCH 가 값이 아니라 자산 '이름'만 넣는 설계라
     원래 값이 없고, 복사 버튼으로 그대로 쓰는 산출물이라 [REDACTED] 로 오염되면 안 된다.
     (자산 값이 절대 안 들어가는 것은 PATCH 노드가 보장한다 — 함정⑥/§5.)

★ 비회원 게이팅(v0.4)도 여기 있다. 원칙은 하나다:
   **위험 사실은 절대 가리지 않는다. 가리는 것은 '해결책'과 '증거의 상세'다.**
   공개 = 등급 · 처방 전/후 ASR · 개선폭 · 기법별 차트 · 보호 자산 이름 · 진단 범위 고지
   게이팅 = 처방문 전문 · 시도별 상세 로그
   개선폭까지 가리면 "가입하면 뭘 얻는지"를 몰라 그냥 이탈한다. 처방 후 수치를 보여주고
   그 아래 처방문을 가려야 가입 동기가 최대가 된다(SSL Labs·Snyk 의 free scan + gated remediation).

★★ 왜 CSS 블러가 아니라 여기(서버)인가:
   블러는 개발자도구로 3초면 벗겨진다. 보안 진단 도구가 클라이언트에서 가리면 자기모순이고,
   시연 중에 심사위원이 그 자리에서 벗겨 보일 수 있다. **서버가 안 보내면 벗길 게 없다.**
   tests/test_gating.py 가 '비회원 응답 JSON 문자열 안에 처방문 3번째 줄이 물리적으로 없다'를 검사한다.
"""

from __future__ import annotations

from joker.models import SCOPE_NOTICE, technique_ko
from joker.nodes.report import filter_recommendation
from joker.safety.masking import mask_secrets

_EXCERPT_LIMIT = 240


def mask_excerpt(text: str, limit: int = _EXCERPT_LIMIT) -> str:
    """응답 일부를 마스킹 + 절삭. 비밀값 원문이 화면·이력으로 새지 않게 한다."""
    masked = mask_secrets(text or "")
    if len(masked) <= limit:
        return masked
    return masked[:limit].rstrip() + "…"


def target_block(t) -> dict:
    """TargetInfo → target dict (running/registry 경로용)."""
    fidelity = t.fidelity.value if hasattr(t.fidelity, "value") else t.fidelity
    return {
        "model": t.model, "backend": t.backend, "preset": t.preset,
        "temperature": t.temperature, "seed": t.seed, "fidelity": fidelity,
        "scope_notice": t.scope_notice, "model_notice": t.model_notice,
    }


def _target_from_db(head: dict, attempts: list[dict]) -> dict:
    """저장된 진단의 target 블록 복원. scope_notice/model_notice 는 상수·규칙에서 재생성한다
    (DB 에 문구를 중복 저장하지 않는다). temperature/seed 는 attempt 행에서 읽는다."""
    fidelity = head.get("fidelity") or (
        "proxy_model" if head.get("is_approximation") else "real_model")
    model = head.get("model_victim") or "unknown"
    temp = attempts[0]["temperature"] if attempts else 0.0
    seed = attempts[0]["seed"] if attempts else 42
    proxy = fidelity == "proxy_model"
    return {
        "model": model, "backend": head.get("backend"), "preset": head.get("target_preset"),
        "temperature": temp, "seed": seed, "fidelity": fidelity,
        "scope_notice": SCOPE_NOTICE,
        "model_notice": (
            f"고객님 챗봇의 실제 모델이 아니라 대리 모델({model})로 진단했습니다. "
            "실제 모델에서는 결과가 다를 수 있습니다." if proxy else None),
    }


def _asr(verdicts: list[str]) -> float:
    return round(sum(1 for v in verdicts if v == "leak") / len(verdicts), 3) if verdicts else 0.0


def _by_technique_array(attempts: list[dict]) -> list[dict]:
    """attempts 를 기법별로 접어 before/after ASR 표(계약 배열형)로. by_technique 는 DB 에
    따로 없으므로 여기서 재계산한다(리포트 노드와 같은 정의: leak/전체, before=R1)."""
    buckets: dict[str, dict] = {}
    for a in attempts:
        b = buckets.setdefault(a["technique"], {"before": [], "after": []})
        (b["before"] if a["round_no"] == 1 else b["after"]).append(a["verdict"])
    return [
        {"technique": t, "technique_ko": technique_ko(t),
         "before": _asr(buckets[t]["before"]), "after": _asr(buckets[t]["after"]),
         "total": len(buckets[t]["before"])}
        for t in sorted(buckets)
    ]


def _attempt(a: dict) -> dict:
    return {
        "attack_id": a["attack_id"], "technique": a["technique"],
        "technique_ko": technique_ko(a["technique"]), "round_no": a["round_no"],
        "verdict": a["verdict"], "verdict_by": a["verdict_by"],
        "leak_channel": a["leak_channel"],
        "response_excerpt": mask_excerpt(a.get("response_raw") or ""),
    }


# 비회원에게 보여줄 처방문 미리보기 줄 수. 0 이면 "뭘 얻는지" 감이 안 오고,
# 너무 많으면 굳이 가입할 이유가 없어진다. 2줄 = 첫 문장 + 방어 패턴 하나의 시작.
GATE_PREVIEW_LINES = 2
GATE_UNLOCK_MESSAGE = "무료 회원가입 시 전체 처방문과 시도별 상세를 볼 수 있습니다."


def _apply_gate(out: dict) -> dict:
    """비회원 응답에서 '해결책'을 덜어낸다(제자리 변경). 위험 사실은 하나도 안 건드린다.

    ★ 가려진 '양'을 숫자로 같이 내려보낸다. 막연히 흐려두면 사용자는 '별거 없나 보다' 로 읽는다.
      "12줄 중 10줄이 비공개" 처럼 숫자가 붙어야 가입 동기가 생긴다.
    """
    report = out.get("report") or {}
    # 빈 줄은 세지 않는다 — 처방문은 문단 사이가 비어 있어서, 그대로 세면 '가려진 줄 수'가 부풀려진다.
    lines = [ln for ln in (report.get("patched_prompt") or "").splitlines() if ln.strip()]
    attempts = report.get("attempts") or []

    report["patched_prompt"] = "\n".join(lines[:GATE_PREVIEW_LINES])
    report["attempts"] = []          # ★ 잘라내는 게 아니라 아예 안 담는다

    out["gated"] = {
        "is_gated": True,
        "patched_prompt_total_lines": len(lines),
        "patched_prompt_hidden_lines": max(0, len(lines) - GATE_PREVIEW_LINES),
        "attempts_total": len(attempts),
        "attempts_hidden": len(attempts),
        "unlock": GATE_UNLOCK_MESSAGE,
    }
    return out


def serialize_run(run: dict, viewer: dict | None = None) -> dict:
    """Repository.load_run() 결과 → GET /api/runs/{id} 응답(done/inconclusive).

    inconclusive 면 등급·ASR 을 null 로 두고 report.reason 을 채운다
    (함정②: '진단 불가'를 '안전'으로 그리면 안 된다).

    viewer=None(비회원)이면 _apply_gate 로 처방문 전문·시도별 상세를 **응답에서 뺀다**.
    viewer 가 있으면 v0.3 과 완전히 같은 응답이다(계약 하위호환)."""
    head = run
    attempts = run.get("attempts", [])
    assets = run.get("assets", [])
    inconclusive = bool(head.get("inconclusive"))

    recon = {
        "persona": head.get("persona"),
        "org": head.get("org"),
        "assets": [{"name": a["name"], "kind": a["kind"], "confidence": a["confidence"]}
                   for a in assets],
        "forbidden_actions": [a["name"] for a in assets if a["kind"] == "forbidden_action"],
    }
    out = {
        "run_id": head.get("run_id"),
        "created_at": head.get("created_at"),
        "status": "inconclusive" if inconclusive else "done",
        "target_prompt_hash": head.get("target_prompt_hash"),
        "target": _target_from_db(head, attempts),
        "recon": recon,
    }
    if inconclusive:
        out["report"] = {
            "grade": None, "inconclusive": True,
            "reason": "보호할 값 자산(secret_value)이 0개입니다. 진단할 대상이 없어 등급을 매기지 않습니다.",
            "asr_before": None, "asr_after": None, "asr_delta": None, "attempts": [],
        }
        # 진단 불가는 처방 자체가 없다 → 가릴 것도 없다. 그래도 키는 항상 내려보낸다
        # (화면이 out["gated"] 존재 여부로 분기하지 않게 — 없는 키는 곧 버그가 된다).
        out["gated"] = {"is_gated": False}
        return out
    out["report"] = {
        "grade": head.get("grade"),
        "inconclusive": False,
        "comparable": bool(head.get("comparable")),
        "asr_before": head.get("asr_before"),
        "asr_after": head.get("asr_after"),
        "asr_delta": head.get("asr_delta"),
        "by_technique": _by_technique_array(attempts),
        "applied_patterns": run.get("applied_patterns", []),
        # 처방 ② 입력단 필터 권고 — 건수·사유만 담는다(공격문 원문은 안 담는다).
        "filter_recommendation": filter_recommendation(
            [a.get("rendered_text") or "" for a in attempts
             if a.get("round_no") == 2 and a.get("verdict") == "leak"]),
        "patched_prompt": head.get("patched_prompt"),   # ★ 마스킹 안 함(위 docstring)
        "attempts": [_attempt(a) for a in attempts],
    }
    if viewer is None:
        return _apply_gate(out)
    out["gated"] = {"is_gated": False}
    return out


def running_payload(run_id: str, target: dict, estimated: dict) -> dict:
    """진행 중 진단의 GET 응답. 아직 DB 에 없으므로 레지스트리 정보로 만든다."""
    return {
        "run_id": run_id, "status": "running",
        "target": target, "estimated_calls": estimated.get("victim_max"),
        "report": None,
    }


def error_payload(run_id: str, target: dict, error: dict) -> dict:
    return {"run_id": run_id, "status": "error", "target": target, "error": error}
