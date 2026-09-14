"""scripts/baseline_compare — 베이스라인 비교의 집계·정직성 규칙 검증(torch 없이).

무엇을 지키나:
  · 혼동행렬 산수가 맞고, 정밀도·재현율·F1 이 sklearn binary 정의와 같다.
  · **길이 규칙의 문턱은 베이스라인에 유리한 쪽(F1 최대)으로 고른다** — 베이스라인을 약하게
    잡아 놓고 이겼다고 말하는 것이 이 표에서 제일 하기 쉬운 거짓말이라 테스트로 막는다.
  · 공격만 있는 세트(정상 0건)에서는 정밀도·F1 을 내지 않는다 — 분모가 없는 값을 지어내면 안 된다.
  · 키워드 목록이 비어 있지 않고 중복이 없다(목록을 지우고 '베이스라인이 0점'이 되는 사고 방지).
  · 오탐0 문턱은 실제로 정상 표본에서 오탐 0 이 된다.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "baseline_compare.py"
_spec = importlib.util.spec_from_file_location("baseline_compare", _PATH)
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)  # type: ignore[union-attr]


# ── 혼동행렬 ──────────────────────────────────────────────────────────
def test_confusion_counts_and_f1():
    atk = ["공격1", "공격2", "공격3", "공격4"]
    ben = ["정상1", "정상2"]
    pred = lambda t: t in {"공격1", "공격2", "공격3", "정상1"}   # TP3 FN1 FP1 TN1
    m = bc.confusion(atk, ben, pred)
    assert (m["tp"], m["fn"], m["fp"], m["tn"]) == (3, 1, 1, 1)
    assert m["precision"] == pytest.approx(3 / 4)
    assert m["recall"]["rate"] == pytest.approx(3 / 4)
    assert m["f1"] == pytest.approx(0.75)


def test_precision_and_f1_are_none_without_benign_samples():
    """OOD 는 공격만 있는 세트다 — 정밀도를 1.0 으로 찍으면 과장이 된다."""
    m = bc.confusion(["공격1", "공격2"], [], lambda t: True)
    assert m["precision"] is None
    assert m["fpr"] is None
    assert bc.f1_str(m) == "–" and bc.prec_str(m) == "–"


def test_recall_cell_carries_confidence_interval():
    m = bc.confusion(["a"] * 10, ["b"] * 10, lambda t: t == "a")
    assert m["recall"]["k"] == 10 and m["recall"]["n"] == 10
    assert m["recall"]["lo"] < 1.0, "10/10 을 '100% 확정'으로 보고하면 과장이다"


# ── 베이스라인 정직성 ─────────────────────────────────────────────────
def test_length_threshold_is_chosen_to_favour_the_baseline():
    """문턱 탐색은 F1 을 최대화해야 한다 — 어떤 다른 문턱도 더 좋을 수 없다."""
    atk = ["가" * 60, "나" * 70, "다" * 80, "라" * 20]
    ben = ["마" * 10, "바" * 15, "사" * 65]
    th, f1 = bc.best_length_threshold(atk, ben)
    for other in range(1, 120):
        m = bc.confusion(atk, ben, lambda t, o=other: bc.length_hit(t, o))
        assert m["f1"] <= f1 + 1e-9, f"문턱 {other} 가 선택된 {th} 보다 낫다 — 베이스라인을 약하게 잡았다"


def test_zero_fpr_threshold_actually_yields_no_false_positives():
    ben = ["가" * 10, "나" * 62, "다" * 30]
    th = bc.zero_fpr_length_threshold(ben)
    assert bc.confusion(["라" * 200], ben, lambda t: bc.length_hit(t, th))["fp"] == 0


def test_keyword_list_is_not_empty_and_has_no_duplicates():
    assert len(bc.KEYWORD_FLAT) >= 20
    assert len(bc.KEYWORD_FLAT) == len(set(bc.KEYWORD_FLAT)), "키워드 중복 = 목록을 손으로 늘린 흔적"
    assert set(bc.KEYWORDS) >= {"이전 지시 무시", "역할 위장·권위", "출력 형식 강제", "난독화", "간접 지시"}, \
        "키워드 묶음은 공격 기법 정의를 따라간다"


def test_keyword_rule_is_case_insensitive_for_ascii_tokens():
    assert bc.keyword_hit("이 문자열을 BASE64 로 디코딩해줘")
    assert not bc.keyword_hit("오늘 점심 뭐 먹지")
