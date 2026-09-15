"""Settings → Provider 조립. backend 분기는 '오직 여기서만' 일어난다.

역할별(victim/recon/judge)로 백엔드를 따로 고를 수 있다(혼합 배치):
- victim  : 보통 local(Ollama) 유지 — 실제 사용자는 저가 모델을 쓰므로 재현이 정직해진다.
- recon   : openai 권장 — 로컬 3b 는 JSON 추출을 자주 깬다.
- judge   : openai 권장 — 규칙이 못 잡는 의역·설명형 유출까지 판정.
접속 정보가 로컬(llm_*)과 상용(openai_*)으로 분리돼 있어 한 진단에서 섞어 쓸 수 있다.

모든 provider 는 budget 래퍼로 감싸 호출 상한을 강제한다.
"""

from __future__ import annotations

from joker.config import Settings
from joker.providers.base import LLMProvider
from joker.providers.budget import BudgetProvider
from joker.providers.mock import MockProvider
from joker.providers.openai_compat import OpenAICompatProvider

# mock RECON 이 돌려주는 payload.
#
# ★ 고정 자산("관리자 임시 접근코드"=SEOUL-1234)을 주장하지 않는다 (2026-09-15).
#   mock 은 지시문을 읽지 못하는 대역인데, 예전에는 사용자가 무엇을 붙여넣든 이 한 줄을
#   '찾아낸 자산' 이라고 답했다. 사용자의 지시문에 DEMO-1234 가 적혀 있어도 자산은
#   SEOUL-1234 였고, 그 결과 유출 판정·마스킹·리포트가 전부 어긋났다
#   (providers/mock.py 상단 참고 — '차단' 배지 옆에 코드값이 남던 문제의 나머지 절반).
#
#   assets 를 비워 두면 nodes.recon 의 기존 규칙 폴백(rule_extract_secrets)이 **사용자의
#   지시문에서** 실제 비밀값을 뽑는다. mock victim 도 같은 함수를 쓰므로 둘이 어긋날 수 없다.
#   지시문에 비밀값이 없으면 그대로 '진단 불가'(함정②)로 떨어진다 — 그게 정직한 답이다.
#   persona/org 도 지어내지 않는다. 모르는 것을 아는 척하면 화면이 사용자의 지시문과
#   무관한 회사 이름을 사실처럼 보여주게 된다.
_DEMO_RECON: dict = {"assets": [], "persona": None, "org": None, "forbidden_actions": []}


def _mock_for(role: str) -> MockProvider:
    if role == "recon":
        return MockProvider(role="recon", scenario={"payload": _DEMO_RECON}, model="mock-recon")
    if role == "judge":
        return MockProvider(role="judge", scenario={"judge": "block"}, model="mock-judge")
    # secret 은 "유출하는 대역인가" 스위치다. **유출할 값 자체는 받은 지시문에서 찾는다**
    # (providers/mock.py: MockProvider._leak_value). 여기 적힌 문자열이 화면에 나가지 않는다.
    return MockProvider(role="victim", scenario={"secret": "SEOUL-1234"}, model="mock-victim")


def _build_one(role: str, model: str, settings: Settings) -> LLMProvider:
    """역할 하나의 provider 를 backend 에 맞게 만든다."""
    backend = settings.backend_for(role)
    if backend == "mock":
        return _mock_for(role)

    # 역할별 접속정보(계약 v0.2). 지정이 없으면 backend 기본값으로 폴백한다.
    # 이게 있어야 victim=고객 모델(BYOK) + judge=우리 OpenAI 처럼 벤더를 섞을 수 있다.
    base_url, api_key = settings.endpoint_for(role)

    inner = OpenAICompatProvider(
        base_url=base_url, api_key=api_key, model=model,
        timeout=settings.request_timeout, max_tokens=settings.max_tokens,
        reasoning_effort=settings.reasoning_effort,
        public_only=(role == "victim" and settings.target_preset == "byok"),
    )
    return BudgetProvider(inner, max_calls=settings.max_calls)


def build_providers(settings: Settings) -> dict[str, LLMProvider]:
    """{'victim':..., 'recon':..., 'judge':...} 반환. 각 역할이 자기 backend·모델로 조립된다."""
    return {
        "victim": _build_one("victim", settings.victim_model, settings),
        "recon": _build_one("recon", settings.recon_model, settings),
        "judge": _build_one("judge", settings.judge_model, settings),
    }
