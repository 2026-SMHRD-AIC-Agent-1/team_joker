import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, authHeaders } from "./client";
import { setSession } from "../auth/session";

afterEach(() => { vi.restoreAllMocks(); setSession({ token: null, guestToken: null }); });

describe("API 클라이언트", () => {
  it("토큰은 헤더로만 보낸다 — URL 에 싣지 않는다", async () => {
    setSession({ token: "tok123", guestToken: "g.sig" });
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await api.get("/api/runs");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/runs");
    expect(String(url)).not.toContain("tok123");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok123", "X-Guest-Token": "g.sig" });
    expect(authHeaders()).toHaveProperty("Authorization");
  });
  it("서버 오류 문구를 그대로 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "invalid_credentials", message: "이메일 또는 비밀번호를 확인하세요." } }), { status: 401 })));
    await expect(api.post("/api/auth/login", {})).rejects.toMatchObject({ code: "invalid_credentials", message: "이메일 또는 비밀번호를 확인하세요." });
  });
  it("/api 밖으로는 부르지 않는다", async () => {
    await expect(api.get("https://evil.example/x")).rejects.toThrow();
  });
  it("오류 객체는 상태 코드를 가진다", () => {
    expect(new ApiError(404, "not_found", "x").status).toBe(404);
  });
});
