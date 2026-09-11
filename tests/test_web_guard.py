"""React 화면(web/)이 Streamlit 화면과 같은 정직성·보안 규칙을 지키는지 — 소스 수준 검사.

node 없이 파이썬만으로 돈다(컨테이너·CI 어디서나). 동작 테스트는 web/ 의 Vitest 가 맡는다.

무엇을 지키나:
  · 받은 문자열을 HTML 로 해석하지 않는다(dangerouslySetInnerHTML 금지) — 우리는 프롬프트 인젝션
    진단 도구다. 진단 대상 문자열이 우리 화면에 태그로 주입되면 그 자체가 자기모순이다.
  · 토큰을 localStorage 에 두지 않는다(공용 PC 에서 다음 사람이 로그인 상태를 물려받는다).
  · 클라이언트 가림(blur) 은 화면이 만든 가짜 문장(.gate-blur)에만 — 게이팅은 서버가 한다.
  · 헤드라인 수치를 화면 코드에 적지 않는다 — headline_metrics.json 에서만 읽는다.
  · API 호출은 api/client.ts 한 곳에서만(토큰을 URL 에 싣는 실수를 한 군데에서 막는다).
  · 정직성 문장(mock 경고·수집 고지 등)이 옮긴 화면에서 빠지지 않는다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
WEB = REPO / "web"
SRC = WEB / "src"

pytestmark = pytest.mark.skipif(not SRC.exists(), reason="web/ 가 없는 체크아웃")


def _files(*exts: str) -> list[Path]:
    return [p for p in SRC.rglob("*") if p.suffix in exts and "node_modules" not in p.parts]


def _code() -> dict[Path, str]:
    return {p: p.read_text(encoding="utf-8") for p in _files(".ts", ".tsx")}


def _strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"(^|[^:])//.*$", r"\1", src, flags=re.M)


def test_no_raw_html_injection():
    for p, s in _code().items():
        assert "dangerouslySetInnerHTML" not in _strip_comments(s), f"{p.name}: 받은 문자열을 HTML 로 넣지 않는다"
        assert "innerHTML" not in _strip_comments(s), f"{p.name}: innerHTML 직접 대입 금지"


def test_tokens_never_in_localstorage():
    for p, s in _code().items():
        assert "localStorage" not in _strip_comments(s), f"{p.name}: 토큰은 sessionStorage(탭 단위)에만"


def test_client_blur_only_on_fabricated_placeholder():
    css = "\n".join(p.read_text(encoding="utf-8") for p in _files(".css"))
    rules = [m.group(0) for m in re.finditer(r"[^{}]+\{[^}]*filter\s*:\s*blur\([^}]*\}", css)]
    assert all(".gate-blur" in r for r in rules), "blur 는 .gate-blur(화면이 만든 가짜 문장)에만"
    for p, s in _code().items():
        assert "blur(" not in _strip_comments(s), f"{p.name}: 스크립트로 진짜 값을 흐리지 않는다"


def test_headline_numbers_not_hardcoded():
    metrics = json.loads((REPO / "data/evidence/headline_metrics.json").read_text(encoding="utf-8"))
    nums = {n for m in metrics["metrics"] for n in re.findall(r"\d+\.\d+%?", m["value"])}
    for p, s in _code().items():
        if p.name.endswith(".test.ts") or p.name.endswith(".test.tsx"):
            continue
        for n in nums:
            assert n not in s, f"{p.name}: 헤드라인 수치 {n} 을 코드에 적지 않는다 — json 에서 읽을 것"
    src = (SRC / "evidence" / "metrics.ts").read_text(encoding="utf-8")
    assert "data/evidence/headline_metrics.json" in src, "수치의 단일 출처를 그대로 가져온다"


def test_fetch_only_in_api_client():
    for p, s in _code().items():
        if p.name in ("client.ts",) or ".test." in p.name:
            continue
        assert "fetch(" not in _strip_comments(s), f"{p.name}: API 는 api/client.ts 를 거쳐 부른다"


def test_web_does_not_touch_engine():
    for p, s in _code().items():
        for mod in re.findall(r"from\s+['\"]([^'\"]+)['\"]", s):
            assert "src/joker" not in mod and not mod.startswith("joker"), f"{p.name}: 엔진을 직접 가져오지 않는다"


# 옮긴 화면에 반드시 남아야 하는 문장. 화면을 옮길 때마다 여기에 추가한다.
HONESTY = [
    "실제 측정값이 아닙니다. 인용하지 마세요",          # mock 배너
    "이름 · 휴대폰번호 · 생년월일은 수집하지 않습니다",   # 가입 수집 고지
    "scrypt 단방향 해시",                              # 비밀번호 저장 고지
    "별도 데이터로 우리가 측정한 값입니다",               # 검증 근거가 이 진단의 수치가 아님
    # ↓ 2단계(새 진단 · 진행 · 리포트 · 탐지). Streamlit tests/test_report_density.py 의 8문장 + 게이팅 문장.
    "다른 공격과 실제 서비스까지 안전하다는 뜻은 아닙니다",        # 히어로 lead
    "실제 서비스의 RAG·도구·대화 이력은 포함하지 않습니다",         # SCOPE_NOTICE
    "저장하지 않으므로 단정하지 않습니다",                          # 해결됨 권고
    "두 기능은 서로를 호출하지 않습니다",                           # 관계도
    "전체를 운영 설정에 그대로 덮어쓰지 마세요",                    # 보강안 경고
    "정상 업무까지 거절하지 않는지도 확인해야 합니다",              # 재검증 권고
    "안전으로 해석하지 말고 재검증하세요",                          # 판정 불가 권고
    "‘안전함’ 을 뜻하지 않습니다",                                  # 진단 불가
    "화면이 만든 예시 문장",                                        # 게이트 — 흐린 줄의 정체
    "애초에 담기지 않습니다",                                       # 게이트 — 서버가 안 보낸다
    "진행률(%)은 표시하지 않습니다",                                # 진행 화면
    "키는 저장하지 않습니다",                                       # BYOK
    "Chat Shield 의 장애가 아닙니다",                               # 대상 모델 연결 실패
    "규칙 층만",                                                    # 탐지기 근거 수치의 하한 단서
]


def test_gate_blur_uses_only_fabricated_lines():
    """게이트의 흐린 줄은 GATE_DECOY 상수에서만 온다 — Gate 컴포넌트가 가려진 '내용' 을 인자로 받지 않는다."""
    src = (SRC / "components" / "report" / "Gate.tsx").read_text(encoding="utf-8")
    code = _strip_comments(src)
    assert "GATE_DECOY[decoy].map" in code
    props = code[code.index("export function Gate("):code.index("}) {", code.index("export function Gate("))]
    for banned in ("patched", "attempts:", "text:", "content", "children"):
        assert banned not in props, f"Gate 가 가려진 내용({banned})을 받으면 진짜를 흐리는 구조가 된다"


def test_no_cancel_button_and_no_percent_progress():
    """서버에 취소 API 가 없다 — 멈춘 척하는 버튼을 만들지 않는다. 진행률 % 도 만들지 않는다."""
    for p, s in _code().items():
        if ".test." in p.name:
            continue
        code = _strip_comments(s)
        assert ">취소하기<" not in code and "진단 취소" not in code, f"{p.name}: 취소 버튼 금지(서버에 취소 API 없음)"
    prog = _strip_comments((SRC / "components" / "report" / "Progress.tsx").read_text(encoding="utf-8"))
    assert "<progress" not in prog and "%`" not in prog


def test_honesty_sentences_present_in_ported_screens():
    joined = "\n".join(_code().values())
    for line in HONESTY:
        assert line in joined, f"옮긴 화면에서 정직성 문장이 빠졌다: {line}"
