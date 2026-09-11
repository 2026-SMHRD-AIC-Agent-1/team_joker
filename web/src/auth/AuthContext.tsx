// 로그인 상태와 비회원 방문자(게스트) 세션을 화면 전체에 공급한다.
//
// ★ 무료 1회는 서버가 센다(계약 v0.7 · POST /api/guest/session). 화면은 서버가 준 잔여 횟수를
//   보여 주기만 한다 — 브라우저가 세면 새로고침 한 번에 무한이 된다.
// ★ 로그인·가입 직후, 이 탭에서 비회원으로 돌린 진단이 있으면 claim 해서 내 것으로 귀속한다.
//   가입 직후 방금 한 진단을 다시 못 여는 게 이 제품의 가장 흔한 이탈 지점이었다.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { GuestSession, LoginResponse, Run } from "../api/types";
import { clearLogin, getSession, loadSession, setSession } from "./session";

export interface GuestQuota {
  remaining: number | null;      // null = 서버에 못 물어봤다(0 과 구분해야 한다)
  limitNote: string;
  runningRunId: string | null;
}

interface AuthState {
  token: string | null;
  email: string | null;
  lastRunId: string | null;
  guest: GuestQuota;
  loggedIn: boolean;
  /** 성공하면 null, 실패하면 화면에 띄울 서버 문구. claimed=true 면 방금 진단이 내 것이 됐다. */
  login: (email: string, password: string) => Promise<{ error: string | null; claimed: boolean }>;
  signup: (email: string, password: string, confirm: string) => Promise<{ error: string | null; claimed: boolean }>;
  logout: () => Promise<void>;
  refreshGuest: () => Promise<GuestQuota>;
  rememberRun: (runId: string | null) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadSession);
  const [token, setToken] = useState(initial.token);
  const [email, setEmail] = useState(initial.email);
  const [lastRunId, setLastRunId] = useState(initial.lastRunId);
  const [guest, setGuest] = useState<GuestQuota>({ remaining: null, limitNote: "", runningRunId: null });

  const guestRequest = useRef<Promise<GuestQuota> | null>(null);
  const [pendingClaim, setPendingClaim] = useState<string | null>(initial.token ? initial.lastRunId : null);
  const refreshGuest = useCallback((): Promise<GuestQuota> => {
    if (guestRequest.current) return guestRequest.current;
    guestRequest.current = (async () => {
      try {
        const body = await api.post<GuestSession>("/api/guest/session", {});
        setSession({ guestToken: body.token });
        const q = { remaining: body.free_runs?.remaining ?? null, limitNote: body.limit_note ?? "", runningRunId: body.running_run_id };
        // 진행 중인 체험 진단이 있으면 그 진단으로 돌아갈 수 있게 기억한다(새로고침 후).
        if (body.running_run_id && !getSession().lastRunId) {
          setSession({ lastRunId: body.running_run_id });
          setLastRunId(body.running_run_id);
        }
        setGuest(q);
        return q;
      } catch {
        // 서버에 못 닿으면 '확인 불가'. 진단 시작은 어차피 서버가 다시 막는다.
        const q = { remaining: null, limitNote: "", runningRunId: null };
        setGuest(q);
        return q;
      }
    })().finally(() => { guestRequest.current = null; });
    return guestRequest.current;
  }, []);

  useEffect(() => {
    void refreshGuest();
  }, [refreshGuest]);

  // 저장된 토큰이 만료·폐기됐으면(서버 재시작 포함) 조용히 비회원으로 되돌린다.
  // ★ 다른 엔드포인트는 깨진 토큰을 '비회원'으로 처리할 뿐 401 을 주지 않아서(계약 v0.4),
  //   확인하지 않으면 화면은 로그인 상태인데 서버는 비회원으로 답하는 어긋남이 생긴다.
  useEffect(() => {
    if (!initial.token) return;
    let alive = true;
    api.get("/api/me").catch((e) => {
      if (alive && getSession().token === initial.token && e instanceof ApiError && e.status === 401) {
        clearLogin();
        setToken(null);
        setEmail(null);
      }
    });
    return () => { alive = false; };
  }, [initial.token]);

  const afterAuth = useCallback(async (body: LoginResponse): Promise<boolean> => {
    setSession({ token: body.token, email: body.user.email });
    setToken(body.token);
    setEmail(body.user.email);
    const runId = getSession().lastRunId;
    let claimed = false;
    if (runId) {
      try {
        await api.post(`/api/runs/${encodeURIComponent(runId)}/claim`, {});
        claimed = true;
      } catch {
        // 진행 중에는 DB 행이 없으므로 완료 후 귀속한다. 조회 권한은 서버가 확인한다.
        try {
          const run = await api.get<Run>(`/api/runs/${encodeURIComponent(runId)}`);
          if (run.status === "running") { setPendingClaim(runId); claimed = true; }
        } catch { /* 접근할 수 없는 결과는 귀속하지 않는다 */ }
      }
    }
    return claimed;
  }, []);

  useEffect(() => {
    if (!token || !pendingClaim) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const claim = async () => {
      try {
        const run = await api.get<Run>(`/api/runs/${encodeURIComponent(pendingClaim)}`);
        if (!alive) return;
        if (run.status === "error") { setPendingClaim(null); return; }
        if (run.status !== "running") {
          await api.post(`/api/runs/${encodeURIComponent(pendingClaim)}/claim`);
          if (alive) setPendingClaim(null);
          return;
        }
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 401)) {
          if (alive) setPendingClaim(null);
          return;
        }
      }
      if (alive) timer = setTimeout(claim, 3000);
    };
    void claim();
    return () => { alive = false; clearTimeout(timer); };
  }, [token, pendingClaim]);

  const login = useCallback(async (mail: string, password: string) => {
    try {
      const body = await api.post<LoginResponse>("/api/auth/login", { email: mail, password });
      const claimed = await afterAuth(body);
      return { error: null, claimed };
    } catch (e) {
      return { error: e instanceof ApiError ? e.message : "진단 서버에 연결하지 못했습니다.", claimed: false };
    }
  }, [afterAuth]);

  const signup = useCallback(async (mail: string, password: string, confirm: string) => {
    if (password !== confirm) return { error: "비밀번호가 일치하지 않습니다.", claimed: false };
    try {
      await api.post("/api/auth/signup", { email: mail, password });
    } catch (e) {
      return { error: e instanceof ApiError ? e.message : "진단 서버에 연결하지 못했습니다.", claimed: false };
    }
    const r = await login(mail, password);
    return r.error ? { error: "가입은 완료됐습니다. 로그인해 주세요.", claimed: false } : r;
  }, [login]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      /* 서버가 못 받아도 이 탭의 토큰은 지운다 */
    }
    clearLogin();
    setPendingClaim(null);
    setToken(null);
    setEmail(null);
  }, []);

  const rememberRun = useCallback((runId: string | null) => {
    setSession({ lastRunId: runId });
    setLastRunId(runId);
  }, []);

  const value = useMemo<AuthState>(() => ({
    token, email, lastRunId, guest, loggedIn: Boolean(token),
    login, signup, logout, refreshGuest, rememberRun,
  }), [token, email, lastRunId, guest, login, signup, logout, refreshGuest, rememberRun]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider 밖에서 useAuth 를 불렀습니다");
  return v;
}
