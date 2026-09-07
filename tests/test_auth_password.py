"""비밀번호 해시 — 계약 v0.4. 틀려도 조용히 돌아가는 코드라 여기서 못 박는다.

왜 이 테스트가 필요한가: '해시해서 저장했다'는 문장은 코드가 아니라 주장이다.
같은 비밀번호가 매번 다른 문자열이 되는지(솔트), 평문이 어디에도 안 남는지,
깨진 해시가 예외 대신 False 가 되는지는 실제로 확인해야 안다.
"""

from __future__ import annotations

import pytest

from joker.api import auth


@pytest.mark.boundary
def test_hash_is_salted_and_verifiable():
    h1 = auth.hash_password("abcd1234")
    h2 = auth.hash_password("abcd1234")
    assert h1 != h2, "같은 비밀번호가 같은 해시가 되면 레인보우 테이블에 통째로 뚫린다(솔트 없음)"
    assert auth.verify_password("abcd1234", h1)
    assert auth.verify_password("abcd1234", h2)
    assert not auth.verify_password("abcd1235", h1)


@pytest.mark.boundary
def test_plaintext_never_appears_in_stored_hash():
    pw = "SuperSecret1"
    h = auth.hash_password(pw)
    assert pw not in h, "저장 문자열에 평문이 섞이면 해시한 의미가 없다"
    assert h.startswith("scrypt$"), "파라미터를 같이 저장해야 나중에 비용을 올릴 수 있다"


@pytest.mark.boundary
@pytest.mark.parametrize("broken", ["", "not-a-hash", "scrypt$x$y$z$q$w", "md5$1$1$1$aa$bb", None])
def test_broken_hash_is_false_not_exception(broken):
    """DB 가 오염돼도 로그인 화면이 500 으로 죽으면 안 된다 — '불일치'로 닫는다(fail closed)."""
    assert auth.verify_password("abcd1234", broken) is False


@pytest.mark.boundary
@pytest.mark.parametrize("pw,ok", [
    ("abcd1234", True),      # 영문+숫자 8자
    ("abcdefgh", False),     # 숫자 없음
    ("12345678", False),     # 영문 없음
    ("abc1", False),         # 8자 미만
    ("a1" * 70, False),      # 128자 초과
])
def test_password_policy(pw, ok):
    assert (auth.validate_password(pw) is None) is ok


@pytest.mark.boundary
@pytest.mark.parametrize("email,ok", [
    ("a@b.com", True), ("  A@B.COM ", True),
    ("nope", False), ("a@b", False), ("a b@c.com", False), ("", False),
])
def test_email_validation_and_normalization(email, ok):
    assert auth.validate_email(email) is ok
    if ok:
        assert auth.normalize_email(email) == auth.normalize_email(email).strip().lower()


@pytest.mark.boundary
def test_email_fingerprint_hides_original():
    fp = auth.email_fingerprint("A@B.com")
    assert fp == auth.email_fingerprint("a@b.com "), "정규화 후 지문이라 대소문자·공백이 같아야 한다"
    assert "@" not in fp and len(fp) == 64, "실패 로그가 곧 가입자 이메일 명단이 되면 안 된다"
