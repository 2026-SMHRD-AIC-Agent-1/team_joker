"""회원 흐름(가입·로그인·로그아웃·조회) — fastapi 를 import 하지 않는다(계약 v0.4).

반환 규약은 api/service.py 와 같게 맞춘다. app.py 가 두 서비스를 같은 배선으로 처리한다:
  실패 → {"ok": False, "status": 4xx, "code": ..., "message": ...}
  성공 → {"ok": True,  "status": 2xx, "body": {...} | None}

★ 로그인 실패 응답은 이유를 구분하지 않는다(계정 열거 방지).
  "없는 이메일"과 "틀린 비밀번호"를 다르게 답하면, 그 API 는 '이 이메일이 가입돼 있는지'를
  알려주는 조회 도구가 된다. 화면설계서 초안(slide6 ⑦)에 이미 통일 문구가 들어 있다.
★ 없는 이메일이어도 더미 해시로 scrypt 를 한 번 돌린다.
  안 돌리면 응답이 눈에 띄게 빨라져서, 메시지를 통일해도 '시간'으로 가입 여부가 새어 나간다.
"""

from __future__ import annotations

import datetime

from joker.api import auth
from joker.store.auth_store import AuthRepository, EmailExists

_dummy_hash: str | None = None


def _dummy() -> str:
    """타이밍 균등화용 더미 해시. 첫 로그인 때 한 번만 계산한다(import 를 느리게 하지 않으려고)."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = auth.hash_password("chat-shield-timing-equalizer-0")
    return _dummy_hash


def _err(status: int, code: str, message: str) -> dict:
    return {"ok": False, "status": status, "code": code, "message": message}


def _ok(status: int, body: dict | None = None) -> dict:
    return {"ok": True, "status": status, "body": body}


class AuthService:
    def __init__(
        self,
        repo: AuthRepository,
        session_days: int = auth.SESSION_DAYS,
        max_tries: int = auth.LOGIN_MAX_TRIES,
        window_sec: int = auth.LOGIN_WINDOW_SEC,
    ) -> None:
        self.repo = repo
        self.session_days = session_days
        self.max_tries = max_tries
        self.window_sec = window_sec

    # ── 가입 ────────────────────────────────────────────────
    def signup(self, body: dict | None) -> dict:
        b = body or {}
        if not isinstance(b, dict) or any(not isinstance(b.get(k, ""), str) for k in ("email", "password")):
            return _err(400, "bad_input", "이메일과 비밀번호는 문자열이어야 합니다.")
        email = auth.normalize_email(b.get("email"))
        password = b.get("password") or ""

        if not auth.validate_email(email):
            return _err(400, "bad_email", "이메일 형식이 올바르지 않습니다.")
        problem = auth.validate_password(password)
        if problem:
            return _err(400, "weak_password", problem)

        try:
            user_id = self.repo.create_user(
                email, auth.hash_password(password), auth.iso(auth.now()))
        except EmailExists:
            # 가입 화면은 중복을 알려줄 수밖에 없다(안 알려주면 사용자가 가입을 못 한다).
            # 대신 '로그인'은 끝까지 구분하지 않는다 — 열거 창구를 하나로 좁히는 것이 목적이다.
            return _err(409, "email_exists", "이미 가입된 이메일입니다.")
        return _ok(201, {"user_id": user_id, "email": email})

    # ── 로그인 ──────────────────────────────────────────────
    def login(self, body: dict | None) -> dict:
        if not isinstance(body, (dict, type(None))) or any(
            not isinstance((body or {}).get(k, ""), str) for k in ("email", "password")
        ):
            return _err(400, "bad_input", "이메일과 비밀번호는 문자열이어야 합니다.")
        b = body or {}
        email = auth.normalize_email(b.get("email"))
        password = b.get("password") or ""
        fingerprint = auth.email_fingerprint(email)
        now = auth.now()
        since = auth.iso(now - datetime.timedelta(seconds=self.window_sec))

        # rate limit 먼저. 비밀번호를 대조하기 전에 막아야 대입 자체가 비싸진다.
        if self.repo.count_login_failures(fingerprint, since) >= self.max_tries:
            return _err(429, "too_many_attempts",
                        f"로그인 시도가 너무 많습니다. {self.window_sec}초 후 다시 시도하세요.")

        user = self.repo.find_user_by_email(email) if email else None
        if user is None:
            auth.verify_password(password, _dummy())   # 타이밍 균등화(결과는 버린다)
            ok = False
        else:
            ok = auth.verify_password(password, user["password_hash"])

        if user is None or not ok or user.get("status") != "active":
            self.repo.record_login_failure(fingerprint, auth.iso(now))
            return _err(401, "invalid_credentials", "이메일 또는 비밀번호를 확인하세요.")

        self.repo.clear_login_failures(fingerprint)
        self.repo.purge_expired_sessions(auth.iso(now))
        token, token_hash = auth.new_session_token()
        expires_at = auth.session_expiry(self.session_days, base=now)
        self.repo.create_session(token_hash, user["user_id"], auth.iso(now), expires_at)
        # ★ 응답에 담는 토큰은 이 한 번뿐이다. DB 에는 해시만 있어 서버도 원문을 다시 못 만든다.
        return _ok(200, {
            "token": token,
            "expires_at": expires_at,
            "user": {"user_id": user["user_id"], "email": user["email"]},
        })

    # ── 로그아웃 ────────────────────────────────────────────
    def logout(self, authorization: str | None) -> dict:
        """토큰이 없거나 이미 무효여도 204. 로그아웃은 실패할 이유가 없고,
        '그 토큰은 유효했다'를 알려줄 이유는 더 없다."""
        token = auth.bearer_token(authorization)
        if token:
            self.repo.delete_session(auth.hash_token(token))
        return _ok(204, None)

    # ── 현재 사용자 ─────────────────────────────────────────
    def viewer(self, authorization: str | None) -> dict | None:
        """Authorization 헤더 → 회원 dict 또는 None(비회원).

        기존 엔드포인트는 이 값이 None 이어도 그대로 동작한다 — Bearer 를 '선택적'으로 받기 때문에
        계약 v0.3 클라이언트가 안 깨진다.
        """
        token = auth.bearer_token(authorization)
        if not token:
            return None
        row = self.repo.find_session(auth.hash_token(token))
        if row is None or auth.is_expired(row["expires_at"]):
            return None
        user = self.repo.find_user_by_id(row["user_id"])
        if user is None or user.get("status") != "active":
            return None
        return {"user_id": user["user_id"], "email": user["email"]}
