"""세션 토큰 — 계약 v0.4.

핵심 주장 2개를 테스트로 고정한다:
① DB 에는 토큰 '원문'이 없다 → joker.db 가 유출돼도 남의 세션으로 로그인할 수 없다.
② 만료된 세션은 무효다 → 판단이 안 서면(파싱 실패 포함) 닫는 쪽으로 간다.
"""

from __future__ import annotations

import datetime
import sqlite3

import pytest

from joker.api import auth
from joker.store.auth_store import AuthRepository


@pytest.fixture
def repo(tmp_path) -> AuthRepository:
    r = AuthRepository(str(tmp_path / "t.db"))
    r.init_schema()
    return r


@pytest.mark.boundary
def test_token_is_random_and_urlsafe():
    a, _ = auth.new_session_token()
    b, _ = auth.new_session_token()
    assert a != b and len(a) >= 40, "secrets.token_urlsafe(32) = 256비트 난수여야 한다"


@pytest.mark.boundary
@pytest.mark.parametrize("header,expected", [
    ("Bearer abc", "abc"), ("bearer abc", "abc"), ("  Bearer   abc  ", "abc"),
    ("Basic abc", None), ("abc", None), ("Bearer", None), ("Bearer   ", None), ("", None), (None, None),
])
def test_bearer_parsing(header, expected):
    assert auth.bearer_token(header) == expected


@pytest.mark.boundary
def test_db_never_stores_raw_token(repo, tmp_path):
    user_id = repo.create_user("a@b.com", auth.hash_password("abcd1234"), auth.iso(auth.now()))
    token, token_hash = auth.new_session_token()
    repo.create_session(token_hash, user_id, auth.iso(auth.now()), auth.session_expiry())

    con = sqlite3.connect(str(tmp_path / "t.db"))
    dump = "\n".join(line for line in con.iterdump())
    con.close()
    assert token not in dump, "★ DB 덤프에 토큰 원문이 있으면 파일 하나로 전 회원 계정이 뚫린다"
    assert token_hash in dump


@pytest.mark.boundary
def test_expired_session_is_invalid():
    past = auth.iso(auth.now() - datetime.timedelta(seconds=1))
    future = auth.iso(auth.now() + datetime.timedelta(days=1))
    assert auth.is_expired(past) is True
    assert auth.is_expired(future) is False
    assert auth.is_expired("깨진값") is True, "파싱 실패는 만료로 본다(fail closed)"


@pytest.mark.boundary
def test_purge_expired_sessions(repo):
    user_id = repo.create_user("a@b.com", auth.hash_password("abcd1234"), auth.iso(auth.now()))
    now = auth.now()
    repo.create_session("h_old", user_id, auth.iso(now), auth.iso(now - datetime.timedelta(days=1)))
    repo.create_session("h_new", user_id, auth.iso(now), auth.iso(now + datetime.timedelta(days=1)))
    assert repo.purge_expired_sessions(auth.iso(now)) == 1
    assert repo.find_session("h_old") is None
    assert repo.find_session("h_new") is not None


@pytest.mark.boundary
def test_deleting_user_cascades_sessions(repo, tmp_path):
    """회원이 사라지면 세션도 사라져야 한다(FK ON DELETE CASCADE 가 실제로 켜져 있는가)."""
    user_id = repo.create_user("a@b.com", auth.hash_password("abcd1234"), auth.iso(auth.now()))
    repo.create_session("h1", user_id, auth.iso(auth.now()), auth.session_expiry())
    con = sqlite3.connect(str(tmp_path / "t.db"))
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("DELETE FROM tb_user WHERE user_id = ?", (user_id,))
    con.commit()
    con.close()
    assert repo.find_session("h1") is None
