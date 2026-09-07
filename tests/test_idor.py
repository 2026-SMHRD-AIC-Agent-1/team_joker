"""IDOR 차단 — 저장소 층. 접근 제어는 화면이 아니라 질의에서 한다.

왜 저장소에서 테스트하나: 화면에서 걸러도 응답에는 이미 남의 데이터가 실려 있다.
개발자도구 한 번이면 그대로 보인다. 그래서 'WHERE user_id' 자체를 못 박는다.

배경(2026-09-07): 회원 기능을 붙이기 전 GET /api/runs/{id} 는 run_id 만 알면
남의 고객사 시스템 지시문·보호 자산이 통째로 보였다. 우리가 만든 보안 도구에서
우리가 찾아 막은 취약점이다.
"""

from __future__ import annotations

import sqlite3

import pytest

from joker.store.sqlite import Repository


def _insert_run(db: str, run_id: str, user_id, grade="B"):
    con = sqlite3.connect(db)
    con.execute(
        "INSERT INTO tb_diagnosis (run_id, created_at, backend, model_victim, grade, inconclusive,"
        " asr_before, asr_after, target_prompt, target_prompt_hash, user_id)"
        " VALUES (?,?,?,?,?,0,?,?,?,?,?)",
        (run_id, "2026-09-07T10:00:00", "local", "qwen2.5:3b-instruct", grade,
         0.593, 0.081, "너는 한비야. 코드는 SEOUL-1234.", "h_" + run_id, user_id),
    )
    con.commit()
    con.close()


@pytest.fixture
def repo(tmp_path):
    r = Repository(str(tmp_path / "t.db"))
    r.init_schema()
    return r


@pytest.mark.boundary
def test_user_id_column_exists_after_migration(repo, tmp_path):
    """★ CREATE TABLE IF NOT EXISTS 는 이미 있는 DB 에 열을 안 만든다.
    _ADDED_COLUMNS 의 ALTER 가 빠지면 팀원 PC(기존 joker.db)에서 이력이 통째로 죽는다."""
    con = sqlite3.connect(str(tmp_path / "t.db"))
    cols = {r[1] for r in con.execute("PRAGMA table_info(tb_diagnosis)")}
    con.close()
    assert "user_id" in cols


@pytest.mark.boundary
def test_list_runs_is_scoped_to_owner(repo, tmp_path):
    db = str(tmp_path / "t.db")
    _insert_run(db, "run_a", "userA")
    _insert_run(db, "run_b", "userB")
    _insert_run(db, "run_anon", None)

    assert [r["run_id"] for r in repo.list_runs(user_id="userA")] == ["run_a"]
    assert [r["run_id"] for r in repo.list_runs(user_id="userB")] == ["run_b"]
    # 비회원 세션은 주인 없는 진단만 본다 — 남의 회원 이력이 섞이면 안 된다
    assert [r["run_id"] for r in repo.list_runs()] == ["run_anon"]


@pytest.mark.boundary
def test_delete_run_only_by_owner(repo, tmp_path):
    db = str(tmp_path / "t.db")
    _insert_run(db, "run_a", "userA")

    assert repo.delete_run("run_a", "userB") is False, "남의 진단은 못 지운다"
    assert repo.load_run("run_a")["run_id"] == "run_a", "실패했는데 지워졌으면 안 된다"
    assert repo.delete_run("run_a", "userA") is True
    with pytest.raises(KeyError):
        repo.load_run("run_a")


@pytest.mark.boundary
def test_delete_run_cascades_children(repo, tmp_path):
    db = str(tmp_path / "t.db")
    _insert_run(db, "run_a", "userA")
    con = sqlite3.connect(db)
    con.execute(
        "INSERT INTO tb_attempt (run_id, round_no, attack_id, technique, goal, rendered_text)"
        " VALUES ('run_a',1,'FORMAT-01','FORMAT','INFO_LEAK','x')")
    con.execute("INSERT INTO tb_asset (run_id, name, kind) VALUES ('run_a','코드','secret_value')")
    con.commit()
    con.close()

    assert repo.delete_run("run_a", "userA") is True
    con = sqlite3.connect(db)
    left = con.execute("SELECT COUNT(*) FROM tb_attempt WHERE run_id='run_a'").fetchone()[0]
    assets = con.execute("SELECT COUNT(*) FROM tb_asset WHERE run_id='run_a'").fetchone()[0]
    con.close()
    assert left == 0 and assets == 0, "ON DELETE CASCADE 가 안 걸리면 지운 진단의 공격 로그가 남는다"


@pytest.mark.boundary
def test_anonymous_run_saves_null_owner(repo, tmp_path):
    """비회원 진단은 user_id NULL 로 저장된다(주인이 없다)."""
    repo.save_run({"run_id": "run_x", "target_prompt": "t", "attempts": [], "report": None})
    con = sqlite3.connect(str(tmp_path / "t.db"))
    owner = con.execute("SELECT user_id FROM tb_diagnosis WHERE run_id='run_x'").fetchone()[0]
    con.close()
    assert owner is None


@pytest.mark.boundary
def test_run_saves_owner_when_logged_in(repo, tmp_path):
    repo.save_run({"run_id": "run_y", "target_prompt": "t", "attempts": [], "report": None,
                   "user_id": "userA"})
    assert [r["run_id"] for r in repo.list_runs(user_id="userA")] == ["run_y"]
