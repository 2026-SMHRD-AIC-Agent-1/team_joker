"""HTTP 계약 — 회원 엔드포인트 + IDOR 차단을 실제 앱으로 검증한다(계약 v0.4).

이 파일만 fastapi·httpx(web extra)를 요구한다. 없으면 skip 이 아니라 에러가 나야 한다 —
API 테스트가 조용히 사라지면 IDOR 회귀를 아무도 못 잡는다(SPEC §5: skip = 실패).

여기서 확인하는 것:
① 기존 계약(v0.3)이 안 깨진다 — Authorization 없이도 진단·조회가 그대로 된다.
② 남의 run 은 403 이 아니라 404 다 — 존재 여부도 흘리지 않는다.
③ 로그인 실패 응답은 이유를 구분하지 않는다.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

EMAIL_A, EMAIL_B, PW = "a@example.com", "b@example.com", "abcd1234"


@pytest.fixture
def db_path(tmp_path) -> str:
    return str(tmp_path / "api.db")


@pytest.fixture
def client(db_path, monkeypatch):
    # ★ .env 의 load_dotenv() 는 setdefault 라, 여기서 먼저 넣은 값이 이긴다(테스트 격리).
    monkeypatch.setenv("JOKER_DB_PATH", db_path)
    monkeypatch.setenv("JOKER_PROFILE", "mock")
    from joker.api.app import create_app

    with TestClient(create_app()) as c:
        yield c


def _signup_login(client, email) -> tuple[str, str]:
    """(user_id, Bearer 헤더값)"""
    r = client.post("/api/auth/signup", json={"email": email, "password": PW})
    assert r.status_code == 201, r.text
    r = client.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["user"]["user_id"], "Bearer " + body["token"]


def _insert_run(db: str, run_id: str, user_id):
    con = sqlite3.connect(db)
    con.execute(
        "INSERT INTO tb_diagnosis (run_id, created_at, backend, model_victim, grade, inconclusive,"
        " comparable, asr_before, asr_after, asr_delta, target_prompt, target_prompt_hash,"
        " persona, org, patched_prompt, user_id)"
        " VALUES (?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,?)",
        (run_id, "2026-09-07T10:00:00", "local", "qwen2.5:3b-instruct", "B",
         0.593, 0.081, -0.512, "너는 한비야. 관리자 임시 접근코드는 SEOUL-1234.", "h_" + run_id,
         "한비", "한빛물산", "처방문 첫 줄\n둘째 줄", user_id),
    )
    con.commit()
    con.close()


# ── 회원 엔드포인트 ──────────────────────────────────────────
@pytest.mark.boundary
def test_signup_login_me_logout(client):
    _, header = _signup_login(client, EMAIL_A)

    assert client.get("/api/me").status_code == 401, "토큰 없이 /api/me 는 401"
    me = client.get("/api/me", headers={"Authorization": header})
    assert me.status_code == 200 and me.json()["email"] == EMAIL_A

    assert client.post("/api/auth/logout", headers={"Authorization": header}).status_code == 204
    assert client.get("/api/me", headers={"Authorization": header}).status_code == 401


@pytest.mark.boundary
def test_signup_rejects_bad_input(client):
    assert client.post("/api/auth/signup", json={"email": "nope", "password": PW}).status_code == 400
    assert client.post("/api/auth/signup", json={"email": EMAIL_A, "password": "abc"}).status_code == 400
    client.post("/api/auth/signup", json={"email": EMAIL_A, "password": PW})
    dup = client.post("/api/auth/signup", json={"email": EMAIL_A, "password": PW})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "email_exists"


@pytest.mark.boundary
def test_login_failures_are_indistinguishable(client):
    client.post("/api/auth/signup", json={"email": EMAIL_A, "password": PW})
    wrong = client.post("/api/auth/login", json={"email": EMAIL_A, "password": "zzzz9999"})
    ghost = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "zzzz9999"})
    assert wrong.status_code == ghost.status_code == 401
    assert wrong.json() == ghost.json(), "응답이 다르면 가입 여부를 알려주는 API 가 된다"


@pytest.mark.boundary
def test_login_rate_limited(client):
    client.post("/api/auth/signup", json={"email": EMAIL_A, "password": PW})
    for _ in range(5):
        client.post("/api/auth/login", json={"email": EMAIL_A, "password": "zzzz9999"})
    blocked = client.post("/api/auth/login", json={"email": EMAIL_A, "password": "zzzz9999"})
    assert blocked.status_code == 429


# ── IDOR ────────────────────────────────────────────────────
@pytest.mark.boundary
def test_other_users_run_is_404_not_403(client, db_path):
    user_a, header_a = _signup_login(client, EMAIL_A)
    _, header_b = _signup_login(client, EMAIL_B)
    _insert_run(db_path, "run_a", user_a)

    assert client.get("/api/runs/run_a", headers={"Authorization": header_a}).status_code == 200
    for who, header in (("비회원", None), ("남", header_b)):
        r = client.get("/api/runs/run_a", **({"headers": {"Authorization": header}} if header else {}))
        assert r.status_code == 404, f"{who} 에게 200 이 나가면 안 된다"
        assert r.json()["error"]["code"] == "not_found", "403 은 '그 run 이 존재한다'를 알려준다"


@pytest.mark.boundary
def test_other_users_prompt_never_leaks_in_body(client, db_path):
    """★ 상태코드만 보지 말고 본문도 본다 — 지시문 원문이 한 글자도 나가면 안 된다."""
    user_a, _ = _signup_login(client, EMAIL_A)
    _, header_b = _signup_login(client, EMAIL_B)
    _insert_run(db_path, "run_a", user_a)

    r = client.get("/api/runs/run_a", headers={"Authorization": header_b})
    assert "SEOUL-1234" not in r.text and "한빛물산" not in r.text


@pytest.mark.boundary
def test_anonymous_run_stays_open(client, db_path):
    """비회원 진단(user_id NULL)은 주인이 없다 → 그대로 조회된다(계약 v0.3 호환)."""
    _insert_run(db_path, "run_anon", None)
    assert client.get("/api/runs/run_anon").status_code == 200


@pytest.mark.boundary
def test_run_list_is_scoped(client, db_path):
    user_a, header_a = _signup_login(client, EMAIL_A)
    _, header_b = _signup_login(client, EMAIL_B)
    _insert_run(db_path, "run_a", user_a)
    _insert_run(db_path, "run_anon", None)

    mine = client.get("/api/runs", headers={"Authorization": header_a}).json()["runs"]
    assert [r["run_id"] for r in mine] == ["run_a"]
    theirs = client.get("/api/runs", headers={"Authorization": header_b}).json()["runs"]
    assert theirs == []
    anon = client.get("/api/runs").json()["runs"]
    assert [r["run_id"] for r in anon] == ["run_anon"]


@pytest.mark.boundary
def test_delete_requires_ownership(client, db_path):
    user_a, header_a = _signup_login(client, EMAIL_A)
    _, header_b = _signup_login(client, EMAIL_B)
    _insert_run(db_path, "run_a", user_a)

    assert client.delete("/api/runs/run_a").status_code == 401, "비회원은 삭제 불가"
    assert client.delete("/api/runs/run_a", headers={"Authorization": header_b}).status_code == 404
    assert client.get("/api/runs/run_a", headers={"Authorization": header_a}).status_code == 200
    assert client.delete("/api/runs/run_a", headers={"Authorization": header_a}).status_code == 204
    assert client.get("/api/runs/run_a", headers={"Authorization": header_a}).status_code == 404


# ── 기존 계약이 안 깨지는가 ──────────────────────────────────
@pytest.mark.boundary
def test_v03_endpoints_still_work_without_token(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/models").status_code == 200
    assert client.get("/api/runs").status_code == 200
    assert client.get("/api/runs/없는아이디").status_code == 404
    bad = client.post("/api/diagnose", json={})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "target_prompt_required"


# ★ 헤더 값은 ASCII 만 가능하다(RFC 7230). 한글을 넣으면 서버에 닿기도 전에
#   클라이언트가 UnicodeEncodeError 로 죽는다 — 앱 동작이 아니라 테스트가 틀린 것이다.
@pytest.mark.boundary
@pytest.mark.parametrize("header", [
    "Bearer not-a-real-token",   # 형식은 맞지만 DB 에 없는 토큰
    "Bearer ",                   # 토큰 없음
    "Basic abc",                 # 다른 인증 방식
    "garbage",                   # Bearer 도 아님
])
def test_invalid_token_is_treated_as_anonymous(client, header):
    """깨진 토큰으로 기존 엔드포인트를 부르면 401 이 아니라 '비회원'으로 동작한다.
    Bearer 를 선택적으로 받는다는 계약(v0.4)의 실체 — v0.3 클라이언트가 안 깨지는 근거."""
    r = client.get("/api/runs", headers={"Authorization": header})
    assert r.status_code == 200 and r.json()["runs"] == []


@pytest.mark.boundary
def test_invalid_token_still_blocks_protected_endpoints(client):
    """단, '비회원 취급'이 '통과'는 아니다. 보호된 두 곳은 그대로 401 이어야 한다."""
    h = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/api/me", headers=h).status_code == 401
    assert client.delete("/api/runs/run_a", headers=h).status_code == 401
