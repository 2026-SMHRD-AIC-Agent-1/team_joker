"""Deps — 노드에 주입하는 의존성 묶음.

노드는 providers 를 '직접 import 하지 않는다'(경계 규칙). 대신 이 Deps 를 인자로 받아
deps.victim.complete(...) 처럼 쓴다. 그래서 테스트에서 MockProvider 를 꽂아
모델 없이 전체 루프를 돌릴 수 있다.

Deps 는 providers.base 의 Protocol 만 참조한다(구현체 import 아님) → 경계 위반 아님.

호출자(API 잡)가 엔진에 주입하는 선택 의존성:
  on_progress  — 어디까지 갔는지 알려 달라
  should_cancel — 그만두라고 했는지 물어봐 달라 (True 면 엔진이 DiagnosisCancelled 를 던진다)
  detector — 단건 입력문 검사와 공유하는 로컬 JOKER-KO 인스턴스
모두 None 이 기본이며 탐지기가 없으면 규칙 결과만 제공한다.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from joker.config import Settings
from joker.detect_ko import KoDetector
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
    # 취소 요청 확인 콜백(선택). 엔진이 단계 경계와 공격 1건마다 물어본다.
    # ★ 왜 예외를 던지게 했나: 중간까지의 결과를 '진단 결과' 로 저장하면 안 된다.
    #   공격을 20건만 던진 상태의 ASR 은 57건 기준 수치와 나란히 놓을 수 없는 숫자다.
    #   예외로 빠져나가면 make_worker 의 repo.save_run 에 도달하지 못해 아무것도 안 남는다.
    should_cancel: Callable[[], bool] | None = None
    detector: KoDetector | None = None


class DiagnosisCancelled(Exception):
    """사용자가 진행 중인 진단을 취소했다.

    ★ 오류가 아니다. 호출자(api.jobs)는 이것을 error 가 아니라 cancelled 상태로 기록한다 —
      '취소했습니다' 를 '진단 중 오류가 발생했습니다' 로 보여주면 사용자는 자기가 누른 버튼
      때문인지 도구가 고장 난 것인지 구분할 수 없다.
    ★ 여기(deps)에 두는 이유: 이 예외는 should_cancel 콜백 계약의 반쪽이다. 엔진(nodes·
      pipeline)이 api 층을 import 하지 않고도 '그만두라고 했다' 를 표현할 수 있어야 한다.
    """
