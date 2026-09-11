// 엔진 상태. 사이드바 상태 칩과 mock 경고가 쓴다. 30초마다 다시 묻는다.
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Health } from "../api/types";

let cached: { at: number; value: Health | null } | null = null;

export function useHealth(): Health | null | undefined {
  // undefined = 아직 모름, null = 서버에 못 닿음
  const [h, setH] = useState<Health | null | undefined>(cached ? cached.value : undefined);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (cached && Date.now() - cached.at < 5_000) { setH(cached.value); return; }
      api.get<Health>("/api/health")
        .then((v) => { cached = { at: Date.now(), value: v }; if (alive) setH(v); })
        .catch(() => { cached = { at: Date.now(), value: null }; if (alive) setH(null); });
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return h;
}
