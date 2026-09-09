"""실패 경로 4개 — 원인을 아는 실패는 그렇게 말해야 한다.

시연 중 사고는 막을 수 없다. 막을 수 있는 건 '왜 죽었는지 모르는 화면' 이다.
여기서 고정하는 것:
① 워커에서 터진 예외가 화면이 분기할 수 있는 code 로 분류된다.
② 그 과정에서 **예외 문자열(base_url·키가 섞일 수 있다)이 사용자 문구로 새지 않는다.**
③ 호출 상한이 모자라면 3~4분 뒤가 아니라 시작 전에 막는다.
④ 화면에 네 경로가 전부 분기로 존재한다.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from joker.api import service
from joker.api.jobs import classify_error
from joker.config import Profile, Settings
from joker.providers.budget import BudgetExceeded
from joker.providers.openai_compat import ProviderError

DATA = str(Path(__file__).parent.parent / "data" / "attacks")
UI = Path(__file__).resolve().parents[1] / "ui" / "streamlit_app.py"


# ── ① 오류 분류 ─────────────────────────────────────────────
@pytest.mark.boundary
@pytest.mark.parametrize("exc,code", [
    (ProviderError("connect failed"), "target_unreachable"),
    (BudgetExceeded("호출 상한 200회 초과"), "budget_exceeded"),
    (RuntimeError("어디선가 터짐"), "engine_error"),
    (ValueError("x"), "engine_error"),
])
def test_classify_error(exc, code):
    assert classify_error(exc)["code"] == code


@pytest.mark.boundary
def test_budget_exceeded_is_not_swallowed_as_engine_error():
    """★ 호출 상한은 우리가 건 안전장치다. engine_error 로 뭉개면 사용자는
    '진단 중 오류가 발생했습니다' 만 보고 무엇을 고쳐야 할지 알 수 없다."""
    assert classify_error(BudgetExceeded("호출 상한 200회 초과"))["code"] == "budget_exceeded"


@pytest.mark.boundary
def test_error_message_never_leaks_exception_text():
    """★ ProviderError 메시지에는 base_url 이 섞여 들어온다. 그대로 화면에 실으면
    우리 내부 주소를 뿌리는 것이다. 코드로 분기하고 문구는 서버가 고정한다."""
    exc = ProviderError("POST https://api.secret-vendor.com/v1 failed: key sk-LEAKME123")
    msg = classify_error(exc)["message"]
    for secret in ("secret-vendor.com", "sk-LEAKME123", "https://"):
        assert secret not in msg


# ── ② 호출 상한 사전 차단 ───────────────────────────────────
@pytest.mark.boundary
def test_prepare_blocks_when_budget_too_low():
    """3~4분 뒤에 BudgetExceeded 로 죽고 결과도 저장 못 하느니, 시작 전에 막는다."""
    settings = Settings(profile=Profile.MOCK, env_profile="pytest", max_calls=10)
    prep = service.prepare({"target_prompt": "너는 한비야. 코드는 SEOUL-1234."}, settings, DATA)
    assert not prep["ok"]
    assert prep["status"] == 400 and prep["code"] == "budget_too_low"
    # 무엇을 얼마로 올려야 하는지가 문구에 있어야 조치가 된다
    assert "JOKER_MAX_CALLS" in prep["message"] and "10" in prep["message"]


@pytest.mark.boundary
def test_prepare_passes_with_default_budget():
    """기본값(200)에서는 이 검사가 정상 진단을 막으면 안 된다."""
    settings = Settings(profile=Profile.MOCK, env_profile="pytest")
    prep = service.prepare({"target_prompt": "너는 한비야. 코드는 SEOUL-1234."}, settings, DATA)
    assert prep["ok"], "기본 설정에서 사전 차단이 걸리면 아무도 진단을 못 한다"
    assert prep["estimated"]["victim_max"] <= settings.max_calls


# ── ③ 화면에 네 경로가 전부 있는가 ──────────────────────────
@pytest.mark.boundary
@pytest.mark.parametrize("code", [
    "target_unreachable",     # 대상 모델 연결 실패
    "budget_exceeded",        # 호출 상한 도달(실행 중)
    "budget_too_low",         # 호출 상한 부족(시작 전)
    "detector_unavailable",   # 탐지 모델 없음
])
def test_ui_handles_every_failure_code(code):
    assert code in UI.read_text(encoding="utf-8"), f"화면에 {code} 분기가 없다"


@pytest.mark.boundary
def test_ui_has_a_single_failure_component():
    """실패 화면이 제각각이면 사용자는 매번 새로 읽어야 한다. 카드 하나로 통일한다."""
    src = UI.read_text(encoding="utf-8")
    assert "def render_failure(" in src and "def render_server_down(" in src
    assert "지금 할 수 있는 것" in src, "조치가 없는 오류 화면은 막다른 길이다"


@pytest.mark.boundary
def test_ui_does_not_print_raw_exceptions():
    """예외 문자열을 화면에 그대로 찍으면 base_url 이 노출된다."""
    src = UI.read_text(encoding="utf-8")
    for banned in ('st.error(f"요청 실패: {e}")',
                   'st.error(f"결과를 못 불러왔습니다: {e}")',
                   'st.error(f"탐지 실패: {e}")'):
        assert banned not in src, f"예외 원문을 화면에 찍는 코드가 남아 있다: {banned}"


@pytest.mark.boundary
def test_inconclusive_never_claims_safe():
    """★ 함정② — '진단 불가' 를 '안전' 으로 그리면 이 도구에서 가장 위험한 거짓말이 된다."""
    src = UI.read_text(encoding="utf-8")
    assert "‘안전함’ 을 뜻하지 않습니다" in src
