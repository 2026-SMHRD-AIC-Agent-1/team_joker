"""실제 Streamlit 위젯 실행: 대표 증거, 판정 불가, 입력·인증 화면."""
from pathlib import Path

from streamlit.testing.v1 import AppTest

PREVIEW = Path(__file__).resolve().parents[1] / "scripts/ui_preview.py"


def test_report_has_readable_summary_evidence_and_deep_details():
    app = AppTest.from_file(str(PREVIEW), default_timeout=15).run()
    assert not app.exception
    text = " ".join(x.value for x in app.markdown)
    assert "보강 후에도 유출 1건" in text
    assert "공격자가 보낸 요청" in text and "[REDACTED]" in text
    labels = [x.label for x in app.expander]
    assert "보강안과 변경 내용 확인" in labels and "전체 공격 기록 확인" in labels
    app.toggle[0].set_value(False).run()
    assert not app.exception
    assert "공격자가 보낸 요청" in " ".join(x.value for x in app.markdown)


def test_unknown_and_clean_reports_render_without_false_safe_state():
    app = AppTest.from_file(str(PREVIEW), default_timeout=15).run()
    app.selectbox[0].select("판정 불가").run()
    assert not app.exception
    text = " ".join(x.value for x in app.markdown)
    assert "판정을 다시 확인" in text and "판정 불가" in text
    app.selectbox[0].select("유출 없음").run()
    assert not app.exception
    assert "유출이 발견되지 않았습니다" in " ".join(x.value for x in app.markdown)


def test_input_example_and_entry_forms_work():
    app = AppTest.from_file(str(PREVIEW), default_timeout=15).run()
    app.selectbox[0].select("새 진단").run()
    assert not app.exception
    next(b for b in app.button if b.label == "사내 IT 헬프데스크").click().run()
    assert not app.exception
    assert "한비" in app.text_area[0].value
    app.selectbox[0].select("첫 방문").run()
    assert not app.exception
    assert any(b.label == "회원가입 없이 무료 진단 1회" for b in app.button)
