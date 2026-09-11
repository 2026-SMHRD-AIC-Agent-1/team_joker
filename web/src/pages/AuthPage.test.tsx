import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";
import { AuthPage } from "./AuthPage";

function mockFetch(routes: Record<string, [number, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const [status, body] = routes[url] ?? [404, { error: { code: "not_found", message: "없음" } }];
    return new Response(JSON.stringify(body), { status });
  }));
}
const guest = { guest_id: "g", token: "g.s", issued: true, limit_note: "제한 안내",
  running_run_id: null, free_runs: { limit: 1, used: 0, remaining: 1, running: 0 } };

beforeEach(() => mockFetch({ "/api/guest/session": [200, guest], "/api/health": [200, { status: "ok", profile: "local" }],
  "/api/auth/login": [401, { error: { code: "invalid_credentials", message: "이메일 또는 비밀번호를 확인하세요." } }] }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderPage = () => render(<MemoryRouter><AuthProvider><AuthPage /></AuthProvider></MemoryRouter>);

describe("첫 화면", () => {
  it("가입 탭은 수집하지 않는 항목과 해시 저장을 말한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "회원가입" }));
    expect(screen.getByText(/이름 · 휴대폰번호 · 생년월일은 수집하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/scrypt 단방향 해시/)).toBeTruthy();
  });
  it("로그인 실패는 서버 문구 그대로(이유를 구분하지 않는다)", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "x1234567" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("이메일 또는 비밀번호를 확인하세요."));
  });
  it("무료 체험 잔여가 0 이면 체험 버튼을 막는다(서버가 센 값)", async () => {
    mockFetch({ "/api/guest/session": [200, { ...guest, free_runs: { ...guest.free_runs, remaining: 0, used: 1 } }] });
    renderPage();
    await waitFor(() => expect((screen.getByRole("button", { name: "회원가입 없이 무료 진단 1회" }) as HTMLButtonElement).disabled).toBe(true));
  });
});
