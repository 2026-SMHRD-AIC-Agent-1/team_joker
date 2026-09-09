"""회원·세션·로그인시도 저장소(계약 v0.4). SQL 은 store 층 밖으로 안 나간다.

Repository(sqlite.py)와 같은 규칙:
- ★ 모든 쿼리는 '?' 파라미터 바인딩만. 값을 문자열로 이어붙이면 SQL 인젝션이 난다.
  우리가 보안 진단 도구인데 우리 DB 가 인젝션 나면 발표가 아니라 사고다.
- 스키마 생성은 Repository.init_schema() 하나에 맡긴다(schema.sql 이 유일한 원본).
  여기서 CREATE 를 따로 쓰면 명세서와 코드가 갈린다.

저장하지 않는 것:
- 세션 토큰 원문(해시만) · 로그인 실패 이메일 원문(지문만) · 이름/연락처/생년월일(열 자체가 없음).
"""

from __future__ import annotations

import sqlite3
import uuid


class EmailExists(Exception):
    """이미 가입된 이메일(UNIQUE 위반)."""


class AuthRepository:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        # ★ 연결 프라그마를 여기서 따로 쓰지 않는다 — store.sqlite.connect 하나로 모았다.
        #   따로 열면 '어떤 연결은 WAL, 어떤 연결은 아님' 이 되어 동시성 보장이 반쪽이 된다.
        from joker.store.sqlite import connect

        con = connect(self.db_path)
        con.row_factory = sqlite3.Row
        return con

    def init_schema(self) -> None:
        """schema.sql + ALTER 마이그레이션. Repository 와 같은 파일·같은 경로를 쓴다."""
        from joker.store.sqlite import Repository

        Repository(self.db_path).init_schema()

    # ── 회원 ────────────────────────────────────────────────
    def create_user(self, email: str, password_hash: str, created_at: str) -> str:
        """가입. 이메일은 호출자가 normalize_email 로 정규화해서 넘긴다."""
        user_id = uuid.uuid4().hex
        con = self._connect()
        try:
            with con:
                con.execute(
                    "INSERT INTO tb_user (user_id, email, password_hash, created_at, status) "
                    "VALUES (?,?,?,?,'active')",
                    (user_id, email, password_hash, created_at),
                )
        except sqlite3.IntegrityError as e:  # email UNIQUE
            raise EmailExists(email) from e
        finally:
            con.close()
        return user_id

    def find_user_by_email(self, email: str) -> dict | None:
        con = self._connect()
        try:
            row = con.execute("SELECT * FROM tb_user WHERE email = ?", (email,)).fetchone()
        finally:
            con.close()
        return dict(row) if row else None

    def find_user_by_id(self, user_id: str) -> dict | None:
        con = self._connect()
        try:
            row = con.execute("SELECT * FROM tb_user WHERE user_id = ?", (user_id,)).fetchone()
        finally:
            con.close()
        return dict(row) if row else None

    # ── 세션 ────────────────────────────────────────────────
    def create_session(self, token_hash: str, user_id: str, created_at: str, expires_at: str) -> None:
        con = self._connect()
        try:
            with con:
                con.execute(
                    "INSERT OR REPLACE INTO tb_session (token_hash, user_id, created_at, expires_at) "
                    "VALUES (?,?,?,?)",
                    (token_hash, user_id, created_at, expires_at),
                )
        finally:
            con.close()

    def find_session(self, token_hash: str) -> dict | None:
        con = self._connect()
        try:
            row = con.execute(
                "SELECT * FROM tb_session WHERE token_hash = ?", (token_hash,)).fetchone()
        finally:
            con.close()
        return dict(row) if row else None

    def delete_session(self, token_hash: str) -> None:
        con = self._connect()
        try:
            with con:
                con.execute("DELETE FROM tb_session WHERE token_hash = ?", (token_hash,))
        finally:
            con.close()

    def purge_expired_sessions(self, now_iso: str) -> int:
        """만료 세션 청소. 로그인할 때마다 한 번 돌려서 테이블이 무한히 안 자라게 한다."""
        con = self._connect()
        try:
            with con:
                cur = con.execute("DELETE FROM tb_session WHERE expires_at <= ?", (now_iso,))
            return cur.rowcount
        finally:
            con.close()

    # ── 로그인 실패 (rate limit) ────────────────────────────
    def record_login_failure(self, email_hash: str, at_iso: str) -> None:
        con = self._connect()
        try:
            with con:
                con.execute(
                    "INSERT INTO tb_login_try (email_hash, at) VALUES (?,?)", (email_hash, at_iso))
        finally:
            con.close()

    def count_login_failures(self, email_hash: str, since_iso: str) -> int:
        """since 이후 실패 횟수. ISO8601 문자열은 형식이 같으면 사전순=시간순이라 그대로 비교한다."""
        con = self._connect()
        try:
            row = con.execute(
                "SELECT COUNT(*) FROM tb_login_try WHERE email_hash = ? AND at >= ?",
                (email_hash, since_iso)).fetchone()
        finally:
            con.close()
        return int(row[0]) if row else 0

    def clear_login_failures(self, email_hash: str) -> None:
        """로그인 성공하면 카운터를 비운다(정상 사용자가 다음에 잠기지 않게)."""
        con = self._connect()
        try:
            with con:
                con.execute("DELETE FROM tb_login_try WHERE email_hash = ?", (email_hash,))
        finally:
            con.close()
