"""Deps — 노드에 주입하는 의존성 묶음.

노드는 providers 를 '직접 import 하지 않는다'(경계 규칙). 대신 이 Deps 를 인자로 받아
deps.victim.complete(...) 처럼 쓴다. 그래서 테스트에서 MockProvider 를 꽂아
모델 없이 전체 루프를 돌릴 수 있다.

Deps 는 providers.base 의 Protocol 만 참조한다(구현체 import 아님) → 경계 위반 아님.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from joker.config import Settings
from joker.models import Attack, DefensePattern
from joker.providers.base import LLMProvider


@dataclass(frozen=True)
class Deps:
    settings: Settings
    victim: LLMProvider           # 공격 대상 재현본(기본 로컬)
    recon: LLMProvider            # 정찰
    judge: LLMProvider            # 판정(gray 만)
    attacks: tuple[Attack, ...] = ()
    patterns: tuple[DefensePattern, ...] = ()
    # 진행 상황 콜백(선택). API 잡이 폴링 응답에 실을 값을 여기로 받는다.
    # ★ None 이 기본이라 CLI·테스트·측정 스크립트의 동작은 하나도 바뀌지 않는다.
    #   화면에 '가짜 진행률' 을 그리지 않으려면 엔진이 실제로 어디까지 갔는지 말해줘야 한다.
    on_progress: Callable[..., None] | None = None
