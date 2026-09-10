"""진단 목록에 '미해결 건수' 가 실린다 — 목록에서 유일하게 행동을 부르는 신호.

등급과 ASR 만 나열하면 "그래서 지금 남은 게 몇 건인데?" 에 답을 못 한다. 미해결 건수는
곧 '입력단 탐지기를 깔아야 하는 이유' 의 개수라, 목록 → 리포트 → 처방②로 이어지는 동선의 출발점이다.

★ 상태 규칙은 models.finding_state 하나만 쓴다. 저장소가 자기 규칙을 따로 두면 목록의 숫자와
  리포트의 숫자가 어긋나고, 그 순간 둘 다 못 믿게 된다.
"""

from __future__ import annotations

import sqlite3

import pytest

from joker.store.sqlite import Repository

# (attack_id, r1, r2) → 미해결 2 · 해결됨 1 · 영향 없음 1 · 처방 후 신규 1 · 재진단 없음 1
PAIRS = [
    ("AUTH-01", "leak", "leak"), ("ROLE-01", "leak", "leak"),
    ("AUTH-02", "leak", "block"), ("AUTH-03", "block", "block"),
    ("FORMAT-01", "block", "leak"), ("INDIRECT-01", "leak", None),
]


def _seed(db, run_id="run_a", other_run=True):
    con = sqlite3.connect(str(db))
    rows = [(run_id, "2026-09-09T10:00:00", "local", "m", "B", 0, 0.5, 0.3, "p", "h")]
    if other_run:
        rows.append(("run_b", "2026-09-09T09:00:00", "local", "m", "A", 0, 0.1, 0.0, "p", "h2"))
    con.executemany(
        "INSERT INTO tb_diagnosis (run_id, created_at, backend, model_victim, grade, "
        "inconclusive, asr_before, asr_after, target_prompt, target_prompt_hash) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)", rows)
    att = []
    for aid, v1, v2 in PAIRS:
        att.append((run_id, 1, aid, "AUTH", "INFO_LEAK", "t", "r", v1))
        if v2 is not None:
            att.append((run_id, 2, aid, "AUTH", "INFO_LEAK", "t", "r", v2))
    con.executemany(
        "INSERT INTO tb_attempt (run_id, round_no, attack_id, technique, goal, rendered_text, "
        "response_raw, verdict) VALUES (?,?,?,?,?,?,?,?)", att)
    con.commit()
    con.close()


@pytest.mark.boundary
def test_list_runs_carries_unresolved_count(tmp_path):
    db = tmp_path / "t.db"
    repo = Repository(str(db))
    repo.init_schema()
    _seed(db)

    runs = {r["run_id"]: r for r in repo.list_runs()}
    assert runs["run_a"]["unresolved"] == 2, "r1 leak → r2 leak 만 미해결이다"
    assert runs["run_a"]["findings_total"] == len(PAIRS), "발견 항목 = attack_id 단위"


@pytest.mark.boundary
def test_runs_without_attempts_report_zero_not_missing(tmp_path):
    """진행 중이거나 진단 불가인 런은 시도가 0건이다. 키가 없으면 화면이 KeyError 로 죽는다."""
    db = tmp_path / "t.db"
    repo = Repository(str(db))
    repo.init_schema()
    _seed(db)

    runs = {r["run_id"]: r for r in repo.list_runs()}
    assert runs["run_b"]["unresolved"] == 0 and runs["run_b"]["findings_total"] == 0


@pytest.mark.boundary
def test_counts_do_not_leak_across_runs(tmp_path):
    """한 런의 시도가 다른 런의 건수로 새면 목록 전체가 거짓이 된다."""
    db = tmp_path / "t.db"
    repo = Repository(str(db))
    repo.init_schema()
    _seed(db)
    total = sum(r["findings_total"] for r in repo.list_runs())
    assert total == len(PAIRS)


@pytest.mark.boundary
def test_empty_list_is_safe(tmp_path):
    repo = Repository(str(tmp_path / "t.db"))
    repo.init_schema()
    assert repo.list_runs() == []
