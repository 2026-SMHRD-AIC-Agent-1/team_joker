"""저장소 연결 프라그마 + SQLite/PostgreSQL 스키마 정합 (ADR-001).

왜 테스트하나:
① WAL 은 한 번 켜면 파일에 남지만, 누가 connect() 를 우회해 sqlite3.connect 를 직접 쓰면
   그 연결만 조용히 기본 모드로 돌아간다. '어떤 연결은 WAL, 어떤 연결은 아님' 이 제일 나쁘다.
② PostgreSQL 이행 스키마는 안 쓰는 파일이라 방치되면 조용히 썩는다. schema.sql 에 테이블을
   추가하고 이쪽을 안 고치면 "이관 경로가 있다" 는 말이 거짓이 된다 → 테이블 집합을 강제한다.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import pytest

from joker.store.auth_store import AuthRepository
from joker.store.sqlite import Repository, connect

_STORE = Path(__file__).resolve().parents[1] / "src" / "joker" / "store"


@pytest.mark.boundary
def test_connect_enables_wal_and_foreign_keys(tmp_path):
    db = str(tmp_path / "t.db")
    Repository(db).init_schema()
    con = connect(db)
    try:
        assert con.execute("PRAGMA journal_mode").fetchone()[0] == "wal", (
            "WAL 이 아니면 진단 워커가 쓰는 동안 화면 읽기가 대기한다(ADR-001 실측 1033ms)")
        assert con.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert con.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    finally:
        con.close()


@pytest.mark.boundary
def test_auth_store_uses_the_same_connection(tmp_path):
    """회원 저장소가 프라그마를 따로 열면 동시성 보장이 반쪽이 된다."""
    db = str(tmp_path / "t.db")
    repo = AuthRepository(db)
    repo.init_schema()
    con = repo._connect()
    try:
        assert con.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert con.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    finally:
        con.close()


def _strip_comments(sql: str) -> str:
    """-- 주석을 걷어낸다. 안 걷으면 설명문에 쓴 'CREATE TABLE IF NOT EXISTS 로 …' 같은 문장이
    테이블 이름으로 잡히고, 'AUTOINCREMENT' 를 언급한 주석이 금지어로 걸린다(0909 실제 오탐)."""
    return "\n".join(line.split("--", 1)[0] for line in sql.splitlines())


def _tables(sql: str) -> set[str]:
    return set(re.findall(r"CREATE TABLE IF NOT EXISTS\s+(\w+)", _strip_comments(sql)))


@pytest.mark.boundary
def test_postgres_schema_matches_sqlite_tables():
    """이행 스키마가 정본(schema.sql)과 같은 테이블 집합을 정의해야 한다."""
    lite = _tables((_STORE / "schema.sql").read_text(encoding="utf-8"))
    pg = _tables((_STORE / "schema_postgres.sql").read_text(encoding="utf-8"))
    assert lite, "schema.sql 에서 테이블을 못 읽었다"
    assert lite == pg, (
        f"두 스키마가 어긋났다. SQLite 에만: {sorted(lite - pg)} / PostgreSQL 에만: {sorted(pg - lite)}\n"
        "schema.sql 을 고쳤으면 schema_postgres.sql 도 같이 고쳐야 한다(ADR-001).")


@pytest.mark.boundary
def test_postgres_schema_has_no_sqlite_only_syntax():
    """복사만 해 놓고 문법을 안 고친 상태를 막는다."""
    pg = _strip_comments((_STORE / "schema_postgres.sql").read_text(encoding="utf-8"))
    for banned in ("AUTOINCREMENT", "PRAGMA"):
        assert banned not in pg, f"PostgreSQL 스키마에 SQLite 전용 구문이 남아 있다: {banned}"


@pytest.mark.boundary
def test_wal_survives_reopen(tmp_path):
    """journal_mode 는 DB 파일에 남는다 — 재접속해도 WAL 이어야 한다."""
    db = str(tmp_path / "t.db")
    Repository(db).init_schema()
    con = sqlite3.connect(db)     # 일부러 프라그마를 안 거는 raw 연결
    try:
        assert con.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    finally:
        con.close()
