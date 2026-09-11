// API 호출 — 엔진을 직접 부르지 않고 HTTP 로만 FastAPI 를 부른다(Streamlit 화면과 같은 경계).
//
// ★ 같은 출처(/api)로만 부른다. 개발 중에는 Vite 프록시, 시연 때는 FastAPI 가 이 화면을 내준다.
//   그래서 서버에 CORS 를 열 필요가 없고, 다른 사이트가 이 API 를 브라우저로 부를 길도 안 생긴다.
// ★ 토큰·키는 URL 에 절대 넣지 않는다(접속 로그·히스토리·리퍼러에 남는다). 헤더와 본문으로만.
// ★ 서버 오류 문구는 서버가 준 것을 그대로 쓴다. 화면이 지어내면 서버와 갈린다
//   (특히 로그인 실패 문구는 '이유를 구분하지 않는다' 가 설계다).

import { getSession } from "../auth/session";
import type { ApiErrorBody } from "./types";

const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly runId?: string;
  constructor(status: number, code: string, message: string, runId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.runId = runId;
  }
}

/** 서버에 닿지 못한 경우(서버 꺼짐·네트워크). 화면은 '서버 연결 끊김' 카드를 그린다. */
export class NetworkError extends Error {}

export function authHeaders(): Record<string, string> {
  const s = getSession();
  const h: Record<string, string> = {};
  // 로그인 상태면 Bearer, 비회원이면 게스트 토큰. 둘 다 있을 수 있다(가입 직후 체험 진단 귀속).
  if (s.token) h["Authorization"] = `Bearer ${s.token}`;
  if (s.guestToken) h["X-Guest-Token"] = s.guestToken;
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!path.startsWith("/api/")) throw new Error("API 경로는 /api/ 로 시작해야 합니다");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      signal: ctrl.signal,
    });
  } catch {
    // ★ 예외 원문을 화면에 싣지 않는다 — 내부 주소가 섞여 올 수 있다.
    throw new NetworkError("진단 서버에 연결하지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "", err?.message ?? `요청에 실패했습니다 (${res.status})`, err?.run_id);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};
