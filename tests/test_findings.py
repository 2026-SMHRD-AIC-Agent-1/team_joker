"""발견 항목(Finding) 5상태와 그 집계 — 결과 화면의 뼈대.

★ 이 파일이 지키는 것은 하나다: **상태 5개의 합이 total 과 같다.**
  화면이 "미해결 2 · 해결됨 31 · 영향 없음 24" 를 띄우는데 합이 공격 수와 다르면,
  심사에서 "그 표 기준이 뭐죠" 한마디에 무너진다. 실측 DB(진단 123건)에는
  r1 block → r2 leak(처방이 새로 연 구멍) 99건과 r2 미실행 836건이 실제로 있어서,
  3상태만 세면 그 행들이 조용히 사라진다.
"""

from __future__ import annotations

import pytest

from joker.api.serialize import (FINDING_STATES, finding_state, findings_summary,
                                 mask_excerpt, serialize_run)


def _at(aid, rno, verdict, **kw):
    base = dict(attack_id=aid, technique="AUTH", goal="INFO_LEAK", round_no=rno,
                verdict=verdict, verdict_by="rule", leak_channel="plain",
                rendered_text=f"{aid}-r{rno} 공격 문구", response_raw="응답",
                temperature=0.0, seed=42)
    base.update(kw)
    return base


@pytest.mark.parametrize("v1,v2,expected", [
    ("leak", "leak", "unresolved"),
    ("leak", "block", "resolved"),
    ("block", "block", "unaffected"),
    ("block", "leak", "regressed"),    # ★ 처방이 새로 연 구멍 — 3상태 모델의 구멍
    ("leak", None, "no_retry"),
    (None, "leak", "no_retry"),
])
def test_finding_state(v1, v2, expected):
    assert finding_state(v1, v2) == expected


def test_summary_sums_to_total():
    attempts = [
        _at("A-1", 1, "leak"), _at("A-1", 2, "leak"),      # 미해결
        _at("A-2", 1, "leak"), _at("A-2", 2, "block"),     # 해결됨
        _at("A-3", 1, "block"), _at("A-3", 2, "block"),    # 영향 없음
        _at("A-4", 1, "block"), _at("A-4", 2, "leak"),     # 처방 후 신규
        _at("A-5", 1, "leak"),                             # 재진단 없음
    ]
    s = findings_summary(attempts)
    assert s == {"unresolved": 1, "resolved": 1, "unaffected": 1,
                 "regressed": 1, "no_retry": 1, "unjudged": 0, "total": 5}
    assert sum(s[k] for k in FINDING_STATES) == s["total"], "상태 합 ≠ 전체면 표가 거짓말이다"


def _run(attempts=None):
    return {
        "privacy_version": 1, "run_id": "run_x", "created_at": "2026-09-09T10:00:00+09:00",
        "model_victim": "qwen2.5:3b-instruct", "backend": "local", "fidelity": "proxy_model",
        "target_prompt_hash": "h", "grade": "C", "comparable": 1,
        "asr_before": 0.5, "asr_after": 0.1, "asr_delta": 0.4,
        "patched_prompt": "1\n2\n3\n4", "assets": [], "applied_patterns": ["P01"],
        "attempts": attempts if attempts is not None else [
            _at("A-1", 1, "leak"), _at("A-1", 2, "leak"),
            _at("A-2", 1, "leak"), _at("A-2", 2, "block")],
    }


MEMBER = {"user_id": "u1", "email": "u@example.com"}


def test_summary_is_public_for_anonymous():
    """★ 건수는 '위험 사실' 이라 비회원에게도 간다. 가리는 건 증거(공격문·응답·판정근거)뿐이다."""
    anon = serialize_run(_run(), viewer=None)
    member = serialize_run(_run(), viewer=MEMBER)
    assert anon["report"]["findings_summary"] == member["report"]["findings_summary"]
    assert anon["report"]["findings_summary"]["unresolved"] == 1
    assert anon["report"]["attempts"] == [], "증거는 여전히 안 나간다"


def test_full_attempts_are_member_only_and_representatives_are_shells():
    """공격 문구는 회원에게만. 비회원 응답 JSON '문자열' 안에 물리적으로 없어야 한다.

    ★ 2026-09-10 수정. 예전 이름은 `..._representatives_are_public` 이었고, 단언도
      `"공격 문구" in json.dumps(anon["representative_findings"])` 로 **공격 문구가 나가는 것을
      정답으로 못 박고 있었다.** docstring("물리적으로 없어야 한다")과 정반대다.
      대표 카드는 비회원에게 '껍데기'(제목·상태·기법)만 나간다 — 위험 사실은 공개, 증거는 잠금.
    """
    import json
    member = serialize_run(_run(), viewer=MEMBER)
    assert member["report"]["attempts"][0]["rendered_text"].startswith("A-1-r1")
    assert member["report"]["attempts"][0]["goal"] == "INFO_LEAK"
    anon = serialize_run(_run(), viewer=None)["report"]
    assert anon["attempts"] == []
    # 카드 껍데기는 남는다 — 무엇이 발견됐는지는 비회원도 알아야 가입 동기가 생긴다
    assert len(anon["representative_findings"]) == 2
    assert all(c["locked"] and c["title"] and c["state"]
               for c in anon["representative_findings"])
    # 증거는 안 나간다
    assert "공격 문구" not in json.dumps(anon["representative_findings"], ensure_ascii=False)


def test_rendered_text_goes_through_the_same_mask():
    """공격문에는 자산 '이름'만 치환되지만, 마스킹 경로를 한 번 더 태워 보장을 두 겹으로 한다."""
    long_attack = "가" * 500
    a = serialize_run(_run([_at("A-1", 1, "leak", rendered_text=long_attack)]),
                      viewer=MEMBER)["report"]["attempts"][0]
    assert a["rendered_text"].endswith("…") and len(a["rendered_text"]) < 500
    assert mask_excerpt("sk-abcdefghijklmnopqrstuvwx") != "sk-abcdefghijklmnopqrstuvwx"


def test_inconclusive_keeps_the_key_at_zero():
    """진단 불가여도 키는 항상 내려보낸다 — 화면이 키 존재로 분기하면 그게 곧 버그가 된다."""
    run = _run([])
    run["inconclusive"] = 1
    s = serialize_run(run, viewer=MEMBER)["report"]["findings_summary"]
    assert s["total"] == 0 and set(s) == {*FINDING_STATES, "total"}
