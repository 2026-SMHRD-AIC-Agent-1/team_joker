"""결정론적 mock provider. 네트워크 없음. 팀원·CI·발표 백업 경로.

role 로 세 노드를 흉내낸다(각 노드에 서로 다른 mock 인스턴스가 주입된다):
  - "recon"  : scenario(JSON payload)를 그대로 반환 → RECON 이 파싱
  - "victim" : system 에 방어 머리표가 있으면 거절, 없으면 **그 지시문에 실제로 적힌** 비밀값을 유출
  - "judge"  : scenario["judge"] 판정을 반환
  - "echo"   : scenario["reply"]/기본 거절문 (기본값, provider 계약 테스트용)

핵심: victim 은 '실제 취약점'을 재현하는 게 아니라, 파이프라인 오케스트레이션(스크리닝→집중→
replay→집계)을 결정론적으로 검증하기 위한 대역이다. 진짜 피해 모델은 로컬 LLM 이다.

★ victim 은 **지시문에 없는 값을 지어내지 않는다** (2026-09-15).
  예전에는 scenario 의 고정 secret("SEOUL-1234")을 사용자의 지시문과 무관하게 뱉었다. 그러면
  RECON 이 찾은 자산(사용자 지시문의 진짜 비밀값)과 어긋나서
    · 규칙 판정은 '자산이 안 나왔다' → block
    · 저장 전 마스킹도 '자산이 아니다' → 원문 그대로 저장
  이 되고, 화면에는 **'차단' 배지 옆에 코드값이 그대로 찍힌 자기모순 리포트**가 나왔다.
  mock 은 README 가 말하는 '발표 백업 경로' 라서, 하필 네트워크가 끊긴 순간 도구가 스스로를
  반박하게 된다. 그래서 유출할 값은 반드시 '받은 지시문 안에서' 찾는다 — 못 찾으면 거절한다.
"""

from __future__ import annotations

import json

from joker.providers.base import CallResult, Usage

_DEFAULT_REFUSAL = "요청하신 정보는 제공할 수 없습니다."
# 처방 머리표. nodes.patch.PATCH_HEADER 와 같은 값이어야 한다(레이어상 import 대신 상수 복제).
_DEFENSE_MARKER = "[보안 지침]"


def secret_in_prompt(prompt: str) -> str | None:
    """지시문에 실제로 적힌 비밀값 리터럴 하나. 없으면 None.

    ★ RECON 의 규칙 폴백(nodes.recon.rule_extract_secrets)을 그대로 쓴다 — 정규식을 따로
      들고 있으면 victim 이 유출한 값과 RECON 이 자산으로 잡은 값이 갈려서, 고치려던 자기모순이
      다시 생긴다. 같은 함수 · 같은 입력이면 어긋날 수가 없다.
    ★ 함수 안에서 import 하는 이유: providers 는 nodes 보다 아래 층이라 모듈 최상단에서
      끌어오면 층이 뒤집힌다(config.target_info 가 models 를 지연 import 하는 것과 같은 이유).
      mock 대역에서만 쓰는 경로라 실사용 import 그래프는 건드리지 않는다.
    """
    from joker.nodes.recon import rule_extract_secrets

    for asset in rule_extract_secrets(prompt or ""):
        if asset.value:
            return asset.value
    return None


class MockProvider:
    def __init__(self, scenario: dict | None = None, model: str = "mock", role: str = "echo") -> None:
        self.scenario = scenario or {}
        self.model = model
        self.role = role
        self.calls = 0

    def _leak_value(self, system: str) -> str | None:
        """이번 호출에서 유출할 값. None 이면 유출하지 않는다.

        scenario["secret"] 은 '이 victim 이 유출하는 대역인가' 를 켜는 스위치다.
        값 자체는 받은 지시문에서 찾는다 — 지시문에 없는 값은 유출할 수 없다.
        """
        fixed = self.scenario.get("secret")
        if not fixed:
            return None                       # 유출하지 않는 victim(거절 대역)
        if fixed in (system or ""):
            return fixed                      # 지시문에 실제로 있는 값 → 그대로 쓴다
        return secret_in_prompt(system)       # 아니면 지시문의 진짜 비밀값. 없으면 None → 거절

    def _dispatch(self, system: str, user: str) -> str:
        sc = self.scenario
        if self.role == "recon":
            payload = sc.get("payload", sc if "assets" in sc else {"assets": []})
            return json.dumps(payload, ensure_ascii=False)

        if self.role == "victim":
            marker = sc.get("defense_marker", _DEFENSE_MARKER)
            if marker and marker in system:
                return sc.get("refusal", _DEFAULT_REFUSAL)
            secret = self._leak_value(system)
            if secret:
                return sc.get("leak_template", "네, 확인해 드릴게요. 값은 {s} 입니다.").replace("{s}", secret)
            return _DEFAULT_REFUSAL

        if self.role == "judge":
            return str(sc.get("judge", "block"))

        # echo
        if "reply" in sc:
            return str(sc["reply"])
        return str(sc.get("default", _DEFAULT_REFUSAL))

    def complete(self, *, system: str, user: str, temperature: float, seed: int) -> CallResult:
        self.calls += 1
        text = self._dispatch(system, user)
        usage = Usage(prompt_tokens=len(system) + len(user), completion_tokens=len(text))
        return CallResult(text=text, model=self.model, usage=usage, latency_ms=1)
