"""인증 원시 함수 — fastapi 도 sqlite 도 모른다(계약 v0.4).

왜 이 층을 따로 두나:
- 비밀번호 해시·토큰 발급은 '틀려도 조용히 돌아가는' 코드다. HTTP·DB 와 섞이면 단위 테스트가
  어려워지고, 테스트가 어려우면 검증 없이 넘어간다. 여기만 있으면 순수 함수라 전부 검증된다.
- 표준 라이브러리만 쓴다. argon2-cffi 가 없는 PC(학원·팀원 노트북)에서도 시연이 돌아야 한다.
  hashlib.scrypt 는 argon2 와 같은 '메모리-하드' 계열이라 GPU 무차별 대입에 강하다.
  (SHA-256 단독 해시는 초당 수십억 회 시도가 가능해서 비밀번호 저장에 쓰면 안 된다.)
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import os
import re
import secrets

# scrypt 파라미터. 메모리 사용량 = 128 * N * r = 128 * 16384 * 8 = 16MB
#   → OpenSSL 기본 maxmem(32MB) 안쪽이라 maxmem 을 따로 안 넘겨도 된다.
#   → 맥북 M2 에서 1회 약 50~100ms. 로그인 UX 는 멀쩡하고 대량 대입은 비싸진다.
_N, _R, _P = 2**14, 8, 1
_DKLEN, _SALT_LEN = 32, 16

SESSION_DAYS = 7
PASSWORD_MIN = 8
PASSWORD_MAX = 128
LOGIN_MAX_TRIES = 5      # 이메일당
LOGIN_WINDOW_SEC = 60

# 형식 검사용 최소 정규식. '진짜 존재하는 주소인가'는 정규식으로 알 수 없다(메일 인증은 스코프 밖).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"))


# ── 비밀번호 ────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """저장 형식: scrypt$N$r$p$salt_b64$dk_b64 (파라미터를 같이 넣어야 나중에 올릴 수 있다)."""
    salt = os.urandom(_SALT_LEN)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return f"scrypt${_N}${_R}${_P}${_b64e(salt)}${_b64e(dk)}"


def verify_password(password: str, stored: str) -> bool:
    """저장된 해시와 대조. 형식이 깨져 있으면 조용히 False(예외를 밖으로 안 던진다)."""
    try:
        algo, n, r, p, salt_b64, dk_b64 = (stored or "").split("$")
        if algo != "scrypt":
            return False
        salt = _b64d(salt_b64)
        expected = _b64d(dk_b64)
        candidate = hashlib.scrypt(
            (password or "").encode("utf-8"),
            salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
    except Exception:  # noqa: BLE001 — 깨진 해시 문자열은 '불일치'로 처리한다
        return False
    # ★ == 를 쓰면 안 된다. 바이트가 다른 지점에서 즉시 반환돼 비교 시간이 값에 따라 달라지고,
    #   그 시간차로 해시를 한 바이트씩 맞춰갈 수 있다(타이밍 공격). compare_digest 는 상수 시간.
    return hmac.compare_digest(candidate, expected)


def validate_password(password: str) -> str | None:
    """문제가 있으면 사용자에게 보여줄 한 줄, 없으면 None."""
    pw = password or ""
    if len(pw) < PASSWORD_MIN:
        return f"비밀번호는 {PASSWORD_MIN}자 이상이어야 합니다."
    if len(pw) > PASSWORD_MAX:
        return f"비밀번호는 {PASSWORD_MAX}자 이하여야 합니다."
    if not (any(c.isalpha() for c in pw) and any(c.isdigit() for c in pw)):
        return "비밀번호는 영문과 숫자를 모두 포함해야 합니다."
    return None


# ── 이메일 ──────────────────────────────────────────────────
def normalize_email(email: str) -> str:
    """저장·조회는 항상 이 형태로. 대소문자만 다른 중복 가입을 막는다."""
    return (email or "").strip().lower()


def validate_email(email: str) -> bool:
    e = normalize_email(email)
    return bool(e) and len(e) <= 254 and _EMAIL_RE.match(e) is not None


def email_fingerprint(email: str) -> str:
    """rate limit 키. 실패 로그가 곧 '가입자 이메일 명단'이 되지 않게 원문 대신 지문을 남긴다."""
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


# ── 세션 토큰 ───────────────────────────────────────────────
def new_session_token() -> tuple[str, str]:
    """(클라이언트에 줄 원문, DB 에 넣을 sha256 해시).

    token_urlsafe(32) = 256비트 난수. secrets 모듈이므로 예측 불가(random 모듈은 쓰면 안 된다).
    """
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    """세션 토큰은 이미 고엔트로피 난수라 salt·느린 해시가 필요 없다(사전 공격 대상이 아니다)."""
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def bearer_token(authorization: str | None) -> str | None:
    """'Authorization: Bearer xxx' 헤더에서 토큰만. 형식이 아니면 None(=비회원 취급)."""
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


# ── 시각 ────────────────────────────────────────────────────
# 기존 store/sqlite.py 가 naive local + timespec="seconds" 로 쓰고 있어 형식을 맞춘다.
# 같은 형식이면 ISO8601 문자열끼리의 사전순 비교 = 시간순 비교라 SQL 에서 그대로 범위 질의가 된다.
def now() -> datetime.datetime:
    return datetime.datetime.now().replace(microsecond=0)


def iso(dt: datetime.datetime) -> str:
    return dt.isoformat(timespec="seconds")


def session_expiry(days: int = SESSION_DAYS, base: datetime.datetime | None = None) -> str:
    return iso((base or now()) + datetime.timedelta(days=days))


def is_expired(expires_at: str, at: datetime.datetime | None = None) -> bool:
    """파싱 실패도 만료로 본다 — 판단이 안 서면 '유효하지 않다' 쪽으로 닫는다(fail closed)."""
    try:
        return datetime.datetime.fromisoformat(expires_at) <= (at or now())
    except Exception:  # noqa: BLE001
        return True
