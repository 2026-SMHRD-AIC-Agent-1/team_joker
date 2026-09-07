"""회원 흐름 — 계약 v0.4. fastapi 없이 도는 층이라 여기서 전부 검증한다.

★ 이 파일의 제일 중요한 테스트는 test_login_does_not_reveal_whether_email_exists 다.
  "없는 이메일"과 "틀린 비밀번호"를 다르게 답하는 순간, 로그인 API 는 가입 여부 조회 도구가 된다.
"""

from __future__ import annotations

import datetime

import pytest

from joker.api import auth
from joker.api.auth_service import AuthService
from joker.store.auth_store import AuthRepository

EMAIL = "user@example.com"
PW = "abcd1234"


@pytest.fixture
def svc(tmp_path) -> AuthService:
    repo = AuthRepository(str(tmp_path / "t.db"))
    repo.init_schema()
    return AuthService(repo)


@pytest.mark.boundary
def test_signup_then_login(svc):
    r = svc.signup({"email": " USER@Example.com ", "password": PW})
    assert r["ok"] and r["status"] == 201
    assert r["body"]["email"] == EMAIL, "이메일은 소문자·공백제거로 정규화해 저장한다"

    lg = svc.login({"email": "USER@EXAMPLE.COM", "password": PW})
    assert lg["ok"] and lg["status"] == 200
    assert lg["body"]["token"] and lg["body"]["expires_at"]
    assert svc.viewer("Bearer " + lg["body"]["token"])["email"] == EMAIL


@pytest.mark.boundary
@pytest.mark.parametrize("body,code", [
    ({"email": "nope", "password": PW}, "bad_email"),
    ({"email": EMAIL, "password": "abc"}, "weak_password"),
    ({"email": EMAIL, "password": "abcdefgh"}, "weak_password"),
    ({}, "bad_email"),
    (None, "bad_email"),
])
def test_signup_400(svc, body, code):
    r = svc.signup(body)
    assert not r["ok"] and r["status"] == 400 and r["code"] == code


@pytest.mark.boundary
def test_signup_duplicate_is_409(svc):
    svc.signup({"email": EMAIL, "password": PW})
    r = svc.signup({"email": EMAIL, "password": PW})
    assert r["status"] == 409 and r["code"] == "email_exists"


@pytest.mark.boundary
def test_login_does_not_reveal_whether_email_exists(svc):
    """★ 계정 열거 방지. 두 실패는 코드·메시지·상태가 완전히 같아야 한다."""
    svc.signup({"email": EMAIL, "password": PW})
    wrong_pw = svc.login({"email": EMAIL, "password": "zzzz9999"})
    no_user = svc.login({"email": "ghost@example.com", "password": "zzzz9999"})
    assert wrong_pw["status"] == no_user["status"] == 401
    assert wrong_pw["code"] == no_user["code"] == "invalid_credentials"
    assert wrong_pw["message"] == no_user["message"], (
        "메시지가 다르면 '이 이메일은 가입돼 있다'를 알려주는 API 가 된다"
    )


@pytest.mark.boundary
def test_rate_limit_after_five_failures(tmp_path):
    repo = AuthRepository(str(tmp_path / "t.db"))
    repo.init_schema()
    svc = AuthService(repo, max_tries=5, window_sec=60)
    svc.signup({"email": EMAIL, "password": PW})

    for _ in range(5):
        assert svc.login({"email": EMAIL, "password": "zzzz9999"})["status"] == 401
    blocked = svc.login({"email": EMAIL, "password": "zzzz9999"})
    assert blocked["status"] == 429 and blocked["code"] == "too_many_attempts"
    # ★ 잠긴 동안에는 '올바른' 비밀번호도 막힌다 — 대입 자체를 비싸게 만드는 게 목적이다.
    assert svc.login({"email": EMAIL, "password": PW})["status"] == 429


@pytest.mark.boundary
def test_successful_login_clears_failure_counter(tmp_path):
    repo = AuthRepository(str(tmp_path / "t.db"))
    repo.init_schema()
    svc = AuthService(repo, max_tries=5, window_sec=60)
    svc.signup({"email": EMAIL, "password": PW})

    for _ in range(4):
        svc.login({"email": EMAIL, "password": "zzzz9999"})
    assert svc.login({"email": EMAIL, "password": PW})["status"] == 200
    # 성공했으니 카운터가 비어야 한다. 안 비우면 정상 사용자가 다음 오타 1회에 잠긴다.
    for _ in range(4):
        assert svc.login({"email": EMAIL, "password": "zzzz9999"})["status"] == 401


@pytest.mark.boundary
def test_rate_limit_window_expires(tmp_path):
    """윈도가 지난 실패는 세지 않는다(과거 기록으로 영구 잠금이 되면 안 된다)."""
    repo = AuthRepository(str(tmp_path / "t.db"))
    repo.init_schema()
    svc = AuthService(repo, max_tries=5, window_sec=60)
    svc.signup({"email": EMAIL, "password": PW})

    old = auth.iso(auth.now() - datetime.timedelta(seconds=120))
    fp = auth.email_fingerprint(EMAIL)
    for _ in range(10):
        repo.record_login_failure(fp, old)
    assert svc.login({"email": EMAIL, "password": PW})["status"] == 200


@pytest.mark.boundary
def test_logout_invalidates_token(svc):
    svc.signup({"email": EMAIL, "password": PW})
    token = svc.login({"email": EMAIL, "password": PW})["body"]["token"]
    header = "Bearer " + token
    assert svc.viewer(header) is not None
    assert svc.logout(header)["status"] == 204
    assert svc.viewer(header) is None, "로그아웃하면 그 토큰은 즉시 무효여야 한다"
    # 이미 무효인 토큰으로 또 로그아웃해도 204 (유효했는지 알려주지 않는다)
    assert svc.logout(header)["status"] == 204


@pytest.mark.boundary
@pytest.mark.parametrize("header", [None, "", "Basic x", "Bearer", "Bearer 없는토큰"])
def test_viewer_returns_none_for_bad_headers(svc, header):
    assert svc.viewer(header) is None


@pytest.mark.boundary
def test_expired_session_is_not_a_viewer(tmp_path):
    repo = AuthRepository(str(tmp_path / "t.db"))
    repo.init_schema()
    svc = AuthService(repo)
    svc.signup({"email": EMAIL, "password": PW})
    expired = AuthService(repo, session_days=-1).login({"email": EMAIL, "password": PW})
    assert svc.viewer("Bearer " + expired["body"]["token"]) is None
