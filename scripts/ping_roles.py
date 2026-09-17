"""victim·recon·judge 에 1콜씩 보내 어느 역할이 죽었는지, 진짜 원인이 뭔지 찍는다.

target_unreachable 는 ProviderError 전체를 묶은 코드라 원인을 안 남긴다(키·URL 노출 방지).
여기선 로컬 터미널에만 출력하므로 원인 문자열을 그대로 보여준다(키는 mask_secrets 로 가려짐).
사용: cd model && .venv/bin/python scripts/ping_roles.py
"""
import sys, time
sys.path.insert(0, "src")
from joker.config import Settings, load_dotenv
from joker.providers.registry import build_providers

load_dotenv(".env")
s = Settings.from_env()
for role, p in build_providers(s).items():
    base, _ = s.endpoint_for(role)
    t = time.monotonic()
    try:
        r = p.complete(system="ping", user="ping", temperature=0, seed=42)
        print(f"[OK]   {role:6} {s.model_for(role)} @ {base}  {time.monotonic()-t:.1f}s")
    except Exception as e:
        print(f"[FAIL] {role:6} {s.model_for(role)} @ {base}  {time.monotonic()-t:.1f}s\n       {e}")
