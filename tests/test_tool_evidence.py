"""'이 도구의 검증 근거' 카드(ui.render_tool_evidence)와 전체 대화상자.

무엇을 지키나:
  · 수치는 headline_metrics.json 에서만 온다. json 에 없는 key 의 칸은 그리지 않는다.
  · 공격 성공률(asr)은 정상 업무 통과율(benign_pass)과 한 카드에서만 나온다. 짝이 빠지면 카드째 뺀다
    — ASR 만 크게 띄우면 "거절을 늘려서 내린 것" 에 답이 없다.
  · 화면 코드에 헤드라인 숫자를 적지 않는다(재측정 때 화면과 근거가 조용히 어긋난다).
  · 대시보드(빈 화면 포함)·리포트 상단·설정이 같은 대화상자를 연다 — 근거가 설정 안에만 갇히지 않게.
"""

from __future__ import annotations

import html as _h
import json
import re
from pathlib import Path

from streamlit.testing.v1 import AppTest

REPO = Path(__file__).resolve().parents[1]
UI = REPO / "ui" / "streamlit_app.py"
METRICS = json.loads((REPO / "data" / "evidence" / "headline_metrics.json").read_text(encoding="utf-8"))

_HARNESS = '''
import importlib.util, json
spec = importlib.util.spec_from_file_location("shield_ui", {ui!r})
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
ui.load_metrics = lambda: json.loads({metrics!r})
ui.render_tool_evidence("t")
'''


def _run(metrics: dict) -> AppTest:
    app = AppTest.from_string(_HARNESS.format(ui=str(UI), metrics=json.dumps(metrics, ensure_ascii=False)),
                              default_timeout=15).run()
    assert not app.exception
    return app


def _html(app: AppTest) -> str:
    return " ".join(x.value for x in app.markdown)


def _cards(html: str) -> list[str]:
    return re.findall(r'<div class="ev-card">(.*?)</div></div></div>', html)


def test_three_cards_from_real_metrics_and_asr_is_paired():
    html = _html(_run(METRICS))
    by = {m["key"]: m for m in METRICS["metrics"]}
    cards = _cards(html)
    assert len(cards) == 3
    asr_card = next(c for c in cards if by["asr"]["value"] in c)
    assert by["benign_pass"]["value"] in asr_card, "ASR 과 정상 업무 통과율은 같은 카드에 있어야 한다"
    for k in ("defense_matrix", "ood_recall", "fpr"):
        assert by[k]["value"] in html
    assert "별도 데이터로 우리가 측정한 값" in html, "이 진단의 수치가 아니라는 말이 카드 위에 있어야 한다"


def test_asr_card_disappears_without_benign_pass():
    m = {**METRICS, "metrics": [x for x in METRICS["metrics"] if x["key"] != "benign_pass"]}
    html = _html(_run(m))
    asr = next(x for x in METRICS["metrics"] if x["key"] == "asr")
    assert asr["value"] not in html, "짝(정상 업무 통과율) 없이 ASR 만 띄우지 않는다"
    assert len(_cards(html)) == 2


def test_missing_keys_hide_cards_and_invent_nothing():
    m = {**METRICS, "metrics": [x for x in METRICS["metrics"] if x["key"] == "ood_recall"]}
    html = _html(_run(m))
    assert len(_cards(html)) == 1
    for x in METRICS["metrics"]:
        if x["key"] != "ood_recall":
            assert x["value"] not in html


def test_empty_metrics_render_nothing():
    app = _run({})
    assert '<div class="h-sec">이 도구의 검증 근거' not in _html(app)
    assert not [b for b in app.button if b.label == "근거 전체 보기"]


def test_full_view_button_opens_dialog_with_conditions_and_limits():
    app = _run(METRICS)
    next(b for b in app.button if b.label == "근거 전체 보기").click().run()
    assert not app.exception
    html = _html(app)
    for x in METRICS["metrics"]:
        assert _h.escape(x["condition"]) in html and _h.escape(x["source"]) in html
    for line in METRICS["limitations"]:
        assert _h.escape(line) in html


def test_ui_does_not_hardcode_headline_numbers():
    src = UI.read_text(encoding="utf-8")
    for x in METRICS["metrics"]:
        for num in re.findall(r"\d+\.\d+%?", x["value"]):
            assert num not in src, f"{x['key']} 의 수치 {num} 이 화면 코드에 박혀 있다 — json 에서 읽을 것"


def test_evidence_reachable_outside_settings():
    src = UI.read_text(encoding="utf-8")
    dash = src[src.index("def render_dashboard("):src.index("def _scan_table(")]
    assert 'render_tool_evidence("dash_empty")' in dash, "새 계정의 빈 대시보드에서도 근거가 보여야 한다"
    assert 'render_tool_evidence("dash")' in dash
    ctx = src[src.index("def report_context("):src.index("SCOPE_NOTICE = (")]
    assert "evidence_dialog()" in ctx, "리포트 상단에서 근거로 바로 갈 수 있어야 한다"
    assert 'st.expander("이 제품의 검증 근거' not in src, "근거를 설정의 접힌 expander 안에 가두지 않는다"


# ── 두 층 조합 4칸(리포트 02 관계도 아래) ─────────────────────────
_LADDER = '''
import importlib.util, json
import streamlit as st
spec = importlib.util.spec_from_file_location("shield_ui", {ui!r})
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
ui.load_metrics = lambda: json.loads({metrics!r})
ui.render_layer_relation(0)
'''


def _ladder_html(metrics: dict) -> str:
    app = AppTest.from_string(_LADDER.format(ui=str(UI), metrics=json.dumps(metrics, ensure_ascii=False)),
                              default_timeout=15).run()
    assert not app.exception
    return _html(app)


def test_ladder_shows_all_four_configurations_under_relation():
    html = _ladder_html(METRICS)
    steps = next(x for x in METRICS["metrics"] if x["key"] == "defense_matrix")["steps"]
    assert html.count('class="lad-c') == 4
    for x in steps:
        assert _h.escape(x["label"]) in html and _h.escape(x["value"]) in html
    assert "이 진단이 아니라 검증 데이터" in html, "held-out 검증 수치를 이 진단 결과로 읽히게 하지 않는다"


def test_ladder_is_not_drawn_when_a_step_is_missing():
    """'탐지기만' 같은 칸 하나를 빼고 3칸만 보이면 사다리처럼 읽혀 과장이 된다 — 아예 그리지 않는다."""
    m = json.loads(json.dumps(METRICS))
    dm = next(x for x in m["metrics"] if x["key"] == "defense_matrix")
    dm["steps"] = [s for s in dm["steps"] if s["label"] != "탐지기만"]
    html = _ladder_html(m)
    assert 'class="ladder"' not in html
    assert "JOKER-KO 탐지기" in html, "관계도 자체는 남는다"


def test_ladder_numbers_match_the_source_document():
    dm = next(x for x in METRICS["metrics"] if x["key"] == "defense_matrix")
    labels = [s["label"] for s in dm["steps"]]
    assert labels == ["방어 없음", "지시문 보강만", "탐지기만", "둘 다"]
    doc = (REPO / dm["source"]).read_text(encoding="utf-8")
    held = doc[doc.index("## held-out"):doc.index("## 학습에 쓴 시드")]
    for s in dm["steps"]:
        k, n = re.search(r"(\d+)/(\d+)", s["detail"]).groups()
        assert f"({k}/{n}," in held, f"{s['label']} 의 {k}/{n} 이 근거 문서 held-out 표에 없다"
