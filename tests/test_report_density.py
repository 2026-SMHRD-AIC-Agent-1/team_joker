"""리포트 블록 줄이기(0911 D)가 되돌아가지 않게, 그리고 줄이는 과정에서 정직성 문장이 빠지지 않게.

0911 측정(1440px, 본문 최상위 블록): 리포트 내용 블록 20 → 16, 페이지 높이 3,006 → 2,656px.
무엇을 지키나:
  · 줄인 구조 — 히어로 안의 4단계 띠, 카드 안 접기(판정 근거·권고), 관계도 카드 안 설명,
    03 접기 1개(탭 2개), 메뉴에서 '진단 목록' 제외.
  · **정직성 문장은 삭제가 아니라 이동만 했다** — 아래 문장이 화면 코드에서 사라지면 실패한다.
"""

from __future__ import annotations

from pathlib import Path

from streamlit.testing.v1 import AppTest

REPO = Path(__file__).resolve().parents[1]
SRC = (REPO / "ui" / "streamlit_app.py").read_text(encoding="utf-8")
PREVIEW = REPO / "scripts" / "ui_preview.py"

# 이 문장들은 제품 설계 자체다. 지우는 순간 성능을 부풀리는 화면이 된다.
HONESTY = [
    "다른 공격과 실제 서비스까지 안전하다는 뜻은 아닙니다",        # 히어로 lead
    "실제 서비스의 RAG·도구·대화 이력은 포함하지 않습니다",         # SCOPE_NOTICE
    "저장하지 않으므로 단정하지 않습니다",                          # 해결됨 카드 권고(접기 안으로 이동)
    "두 기능은 서로를 호출하지 않습니다",                           # 관계도(카드 안으로 이동)
    "전체를 운영 설정에 그대로 덮어쓰지 마세요",                    # 보강안 경고(권고 3이 겹치던 문장)
    "정상 업무까지 거절하지 않는지도 확인해야 합니다",              # 권고 4(보강안 접기 맨 위로 이동)
    "실제 측정값이 아닙니다. 인용하지 마세요",                      # mock 배너
    "안전으로 해석하지 말고 재검증하세요",                          # 판정 불가 권고
]


def test_honesty_sentences_are_moved_not_deleted():
    for line in HONESTY:
        assert line in SRC, f"정직성 문장이 화면 코드에서 사라졌다: {line}"


def _report() -> AppTest:
    app = AppTest.from_file(str(PREVIEW), default_timeout=15).run()
    assert not app.exception
    return app


def test_run_flow_lives_inside_the_hero_card():
    html = " ".join(x.value for x in _report().markdown)
    hero = next(x for x in html.split('<div class="report-hero">')[1:])
    assert 'class="flow in-hero"' in hero, "4단계 흐름은 히어로 카드 안의 띠다(별도 블록이면 숫자가 두 벌로 읽힌다)"
    assert "같은 공격을 그대로 재생" in hero


def test_card_folds_verdict_and_advice_but_keeps_evidence_visible():
    html = " ".join(x.value for x in _report().markdown)
    assert "공격자가 보낸 요청" in html
    assert '<details class="fold"><summary>판정 근거 · 이 항목의 권고 조치</summary>' in html
    first_card = html[html.index("공격자가 보낸 요청"):html.index('<details class="fold">')]
    assert "보호값이 응답에서 검출됐습니다" not in first_card, "판정 근거 줄은 기본 화면이 아니라 접기 안에 있다"


def test_details_section_is_one_expander_with_two_tabs():
    app = _report()
    labels = [x.label for x in app.expander]
    assert "전체 공격 기록 확인" in labels and "상세 통계와 측정 조건" not in labels
    assert [t.label for t in app.tabs] == ["공격 기록", "통계 · 측정 조건"]


def test_only_diagnosis_specific_actions_stay_visible():
    done = SRC[SRC.index("def render_done("):SRC.index("def render_conditions(")]
    assert "비밀값을 지시문 밖으로 옮기세요" in done
    assert '("보강안의 추가 규칙을 검토하세요"' not in done, "보강안 경고와 겹치는 권고는 목록에 두지 않는다"
    rx = SRC[SRC.index("def render_prescription("):SRC.index("# ── JOKER-KO 탐지기 배치 권고")]
    assert "적용 전에 별도 공격과 정상 질문으로 재검증하세요" in rx
    assert '"benign_pass"' in rx, "재검증 권고의 근거 수치는 headline_metrics.json 에서 읽는다"


def test_history_menu_merged_into_dashboard():
    nav = SRC[SRC.index("NAV = ["):SRC.index("APP_VIEWS")]
    assert '"history"' not in nav, "진단 목록은 메뉴가 아니라 대시보드 '전체 N건 보기' 로 들어간다"
    dash = SRC[SRC.index("def render_dashboard("):SRC.index("def _scan_table(")]
    assert 'go("history")' in dash and "건 보기" in dash
    assert '"history"' in SRC[SRC.index("APP_VIEWS"):SRC.index("ACCOUNT_VIEWS = ")], "목록 화면 자체는 남는다"
