import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";
import { setSession } from "./session";

beforeEach(() => setSession({ token: null, email: null, guestToken: null, lastRunId: null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); setSession({ token: null, email: null, guestToken: null, lastRunId: null }); });
const guest = { token: "g.s", free_runs: { remaining: 1 }, limit_note: "test", running_run_id: null };

function Probe() {
  const auth = useAuth();
  return <><p>{auth.loggedIn ? "회원" : "비회원"}</p><p>{auth.guest.remaining}</p>
    <button onClick={() => void auth.login("test@example.com", "TestOnly123")}>테스트 로그인</button></>;
}

it("StrictMode에서도 동시에 게스트를 두 번 발급하지 않는다", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue(guest);
  render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>);
  await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
  expect(post).toHaveBeenCalledTimes(1);
});

it("진행 중 가입한 게스트 진단은 완료 후 회원에게 귀속한다", async () => {
  setSession({ lastRunId: "run_pending", guestToken: "g.s" });
  let claims = 0;
  vi.spyOn(api, "post").mockImplementation(async path => {
    if (path === "/api/guest/session") return guest as never;
    if (path === "/api/auth/login") return { token: "member", user: { email: "test@example.com" } } as never;
    if (path.endsWith("/claim")) {
      claims++;
      if (claims === 1) throw new ApiError(404, "not_found", "pending");
      return undefined as never;
    }
    throw new Error("unexpected request");
  });
  vi.spyOn(api, "get").mockResolvedValueOnce({ status: "running" }).mockResolvedValue({ status: "done" });
  render(<AuthProvider><Probe /></AuthProvider>);
  fireEvent.click(screen.getByRole("button", { name: "테스트 로그인" }));
  await waitFor(() => expect(claims).toBe(2));
  expect(screen.getByText("회원")).toBeTruthy();
});
