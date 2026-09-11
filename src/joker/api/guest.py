"""비회원 방문자 세션 — '회원가입 없이 무료 진단 1회' 의 서버측 실체 (계약 v0.6).

★ fastapi 를 import 하지 않는다(다른 api/ 모듈과 같은 규칙 — 브리지에서 단위 검증이 된다).

왜 서버에 있나
──────────────
요구는 "회원가입 없이 무료 진단 1회" 다. 이걸 화면에서 세면(session_state·localStorage)
새로고침 한 번, 시크릿 창 한 번에 무한이 된다. 그건 제한이 아니라 **제한이 있는 척**이다.
그래서 카운트는 DB 가 하고, 화면은 서버가 준 잔여 횟수를 표시만 한다.

토큰 설계
─────────
guest_id 는 서버가 만든 난수이고, 클라이언트가 들고 다니는 것은
`<guest_id>.<HMAC-SHA256(secret, guest_id)[:32]>` 형태의 토큰이다.

  · 서명을 붙이는 이유 — 안 붙이면 클라이언트가 `guest_id` 를 아무 문자열로 지어내
    tb_guest 를 무한히 늘릴 수 있다(=카운트가 의미를 잃는다). 서명이 있으면 새 게스트는
    반드시 서버의 발급 엔드포인트를 거친다.
  · 비밀은 아니다 — 이 토큰으로 열 수 있는 것은 '그 방문자 자신의 체험 진단' 뿐이고,
    회원 자원에는 아무 권한이 없다. 세션 토큰(tb_session)과 역할이 다르다.

★ 무엇을 저장하지 않는가 — 우리가 프롬프트 인젝션 진단 도구라서 여기서 특히 엄격하게 잡는다.
  IP 원문 · User-Agent · 화면 크기 · 폰트 · canvas 등 **지문(fingerprint) 요소는 하나도
  수집하지 않는다.** 남는 것은 되돌릴 수 없는 ip_hash 뿐이다.

★ 이 정책의 한계 (화면에도 그대로 쓴다)
  신원 확인이 없으므로 '사람당 정확히 1회' 가 아니다. 실제 제한 단위는
  **(게스트 토큰) 또는 (IP 해시)** 이고, 다른 회선 + 새 브라우저면 1회가 더 생긴다.
  반대로 공유 회선(학원·카페 와이파이)에서는 남이 이미 쓴 1회에 막힐 수 있다.
"""

from __future__ import annotations

import datetime
import hashlib
import hmac
import os
import secrets

FREE_RUNS = 1                  # 무료 체험 허용 횟수. 정책 상수는 여기 하나뿐이다.
_SIG_LEN = 32
_IP_HASH_LEN = 32


def _secret() -> bytes:
    """서명 키. 환경변수가 없으면 프로세스 수명 동안만 유효한 임의 키를 쓴다.

    ★ 없으면 죽이지 않는다 — 팀원 PC 에서 .env 없이 서버를 띄워도 제품은 돌아야 한다.
      서버를 재시작하면 기존 게스트 토큰이 무효가 되지만(=체험 1회가 초기화된다),
      이건 개발 편의 쪽 손해라 기동 실패보다 낫다. 배포 시에는 JOKER_GUEST_SALT 를 준다.
    """
    env = os.environ.get("JOKER_GUEST_SALT")
    if env:
        return env.encode("utf-8")
    global _EPHEMERAL
    if _EPHEMERAL is None:
        _EPHEMERAL = secrets.token_bytes(32)
    return _EPHEMERAL


_EPHEMERAL: bytes | None = None


def now_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


def _sign(guest_id: str) -> str:
    return hmac.new(_secret(), guest_id.encode("utf-8"), hashlib.sha256).hexdigest()[:_SIG_LEN]


def new_guest_id() -> str:
    return "g_" + secrets.token_urlsafe(12)


def make_token(guest_id: str) -> str:
    return f"{guest_id}.{_sign(guest_id)}"


def parse_token(token: str | None) -> str | None:
    """토큰 → guest_id. 형식이 틀리거나 서명이 안 맞으면 None.

    ★ compare_digest 로 비교한다. == 는 앞에서부터 다르면 바로 끝나서, 응답 시간으로
      서명을 한 바이트씩 맞춰 볼 수 있는 여지를 준다(우리 도구의 주제와 직결되는 습관).
    """
    if not token or "." not in token:
        return None
    guest_id, _, sig = token.rpartition(".")
    if not guest_id or len(sig) != _SIG_LEN:
        return None
    return guest_id if hmac.compare_digest(sig, _sign(guest_id)) else None


def hash_ip(ip: str | None) -> str | None:
    """IP → 되돌릴 수 없는 지문. 원문은 어디에도 저장하지 않는다."""
    if not ip:
        return None
    return hashlib.sha256(_secret() + ip.encode("utf-8")).hexdigest()[:_IP_HASH_LEN]


def client_ip(headers, fallback: str | None = None) -> str | None:
    """프록시 뒤에서도 방문자 IP 를 고른다. 없으면 fallback(소켓 주소).

    ★ X-Forwarded-For 는 클라이언트가 위조할 수 있는 헤더다. 그래서 이 값은 **인증에 쓰지
      않는다** — 무료 체험 카운트의 보조 축일 뿐이고, 위조하면 그 방문자의 IP 축 제한이
      느슨해질 뿐 남의 자원에는 닿지 못한다(그건 guest_id 가 막는다).
    """
    xff = headers.get("x-forwarded-for") if hasattr(headers, "get") else None
    trusted = {x.strip() for x in os.environ.get("JOKER_TRUSTED_PROXIES", "").split(",") if x.strip()}
    if xff and fallback in trusted:
        return xff.split(",")[0].strip() or fallback
    return fallback


def quota(repo, guest_id: str, ip_hash: str | None, in_flight: int = 0) -> dict:
    """이 방문자의 무료 체험 잔여. 두 축 중 **더 빡빡한 쪽**을 따른다.

    in_flight: 지금 실행 중인 이 방문자의 진단 수(레지스트리에서 센다).
      아직 DB 에 행이 없는 구간이라 이걸 빼면 새로고침·중복 클릭으로 몇 건이든 시작된다.
    """
    used_guest = repo.guest_run_count(guest_id)
    used_ip = repo.guest_run_count_by_ip(ip_hash) if ip_hash else 0
    used = max(used_guest, used_ip) + in_flight
    return {
        "limit": FREE_RUNS,
        "used": used,
        "remaining": max(0, FREE_RUNS - used),
        "running": in_flight,
    }
