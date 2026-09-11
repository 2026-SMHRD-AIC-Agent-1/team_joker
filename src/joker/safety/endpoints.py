"""BYOK 목적지 제한 및 DNS 검증 결과에 고정한 HTTPS 연결."""
import http.client
import ipaddress
import os
import socket
import ssl
import urllib.request
from urllib.parse import urlsplit


def allowed_endpoint(url: str) -> bool:
    try:
        p = urlsplit(url)
        configured = os.environ.get("JOKER_BYOK_ALLOWED_BASE_URLS", "https://api.openai.com/v1")
        allowed = {x.strip().rstrip("/") for x in configured.split(",") if x.strip()}
        return (url.rstrip("/") in allowed and p.scheme == "https" and bool(p.hostname)
                and p.port in (None, 443) and p.username is None and p.password is None
                and not p.query and not p.fragment and "\\" not in url)
    except (ValueError, TypeError):
        return False


def public_addresses(host: str, port: int = 443) -> list[str]:
    addresses = sorted({r[4][0] for r in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)})
    if not addresses or any(not ipaddress.ip_address(a).is_global or ipaddress.ip_address(a).is_multicast
                            for a in addresses):
        raise ValueError("BYOK 목적지가 공인 주소가 아닙니다.")
    return addresses


def open_public(req, base_url: str, timeout: float):
    if not allowed_endpoint(base_url):
        raise ValueError("허용되지 않은 BYOK 목적지입니다.")
    if req.full_url != base_url.rstrip("/") + "/chat/completions":
        raise ValueError("BYOK 요청 경로가 허용된 모델 경로와 다릅니다.")
    host = urlsplit(base_url).hostname
    addresses = public_addresses(host)

    class PinnedConnection(http.client.HTTPSConnection):
        def connect(self):
            # 인증서 검증/SNI에는 원래 호스트를, TCP에는 검증한 IP만 사용한다.
            self.sock = socket.create_connection((addresses[0], 443), self.timeout)
            self.sock = self._context.wrap_socket(self.sock, server_hostname=host)

    class PinnedHTTPS(urllib.request.HTTPSHandler):
        def https_open(self, request):
            return self.do_open(PinnedConnection, request, context=ssl.create_default_context())

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), PinnedHTTPS(), NoRedirect())
    return opener.open(req, timeout=timeout)
