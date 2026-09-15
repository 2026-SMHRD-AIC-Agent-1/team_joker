// 진단 취소 · 계정 관리 화면 (계약 v0.9 · 2026-09-15).
//
// 여기서 못박는 것:
// ① 진행 화면에 '중단' 이 있고, 없던 시절의 사과 문구는 사라졌다.
// ② 중단은 확인을 한 번 받고, 확인해야 서버를 부른다.
// ③ 취소된 진단은 '실패' 가 아니라 '중단됨' 으로 그려지고, 리포트가 없다고 말한다.
// ④ 설정 화면에 비밀번호 변경과 회원 탈퇴가 있고, 탈퇴는 비밀번호 확인 후에만 요청된다.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api/client";
import { RunPage } from "./RunPage";
import { Settings } from "./Settings";

const authed = { token: "t", email: "me@example.com", loggedIn: true, logout: vi.fn(), forgetLogin: vi.fn() };
vi.mock("../auth/AuthContext", () => ({ useAuth: () => authed }));

beforeEach(() => { authed.logout = vi.fn(); authed.forgetLogin = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

const target = { model: "qwen2.5:3b", backend: "mock", fidelity: "proxy_model", scope_notice: "범위" };

async function renderRun(run: unknown) {
  vi.spyOn(api, "get").mockResolvedValue(run);
  await act(async () => {
    render(<MemoryRouter initialEntries={["/runs/run_x"]}>
      <Routes><Route path="/runs/:runId" element={<RunPage />} /></Routes>
    </MemoryRouter>);
  });
}

// ── 진행 중: 중단 버튼 ───────────────────────────────────────
it("진행 화면은 '취소 기능이 없다' 고 사과하는 대신 중단 버튼을 준다", async () => {
  await renderRun({ run_id: "run_x", status: "running", target, progress: { calls_done: 3 } });
  expect(screen.getByRole("button", { name: "진단 중단" })).toBeTruthy();
  expect(document.body.textContent).not.toContain("취소 기능은 제공하지 않습니다");
  expect(document.body.textContent).not.toContain("서버에 취소 API");
});

it("중단은 확인을 받고 나서야 서버를 부른다 — 버튼만 눌러서는 멈추지 않는다", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue(undefined as never);
  await renderRun({ run_id: "run_x", status: "running", target, progress: {} });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "진단 중단" })); });
  expect(post).not.toHaveBeenCalled();                       // 아직 아무 일도 없다
  expect(screen.getByText(/저장되지 않고 버려집니다/)).toBeTruthy();

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "계속 진행" })); });
  expect(post).not.toHaveBeenCalled();                       // 취소를 취소하면 그대로 진행

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "진단 중단" })); });
  const buttons = screen.getAllByRole("button", { name: "진단 중단" });
  const confirm = buttons[buttons.length - 1];
  await act(async () => { fireEvent.click(confirm); });
  expect(post).toHaveBeenCalledWith("/api/runs/run_x/cancel", {});
  // ★ 요청 접수와 '멈췄다' 는 다르다. 엔진은 던지고 있는 공격 1건을 마친 뒤에 선다 —
  //   그 사이를 비워 두면 사용자는 버튼이 안 먹은 줄 알고 다시 누른다.
  expect(screen.getByText(/중단을 요청했습니다/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "진단 중단" })).toBeNull();
});

// ── 중단된 진단 ──────────────────────────────────────────────
it("중단된 진단은 '실패' 가 아니라 '중단됨' 으로 그려진다", async () => {
  await renderRun({ run_id: "run_x", status: "cancelled", target, report: null });
  expect(screen.getByRole("heading", { name: "진단을 중단했습니다" })).toBeTruthy();
  // ★ 사용자가 누른 정지를 도구의 고장으로 보여주면 안 된다
  expect(document.body.textContent).not.toContain("진단이 끝나지 못했습니다");
  expect(document.body.textContent).not.toContain("오류");
  // ★ 없는 결과를 '중간 결과' 로 만들어 보여주지 않는다 — 없다고 말한다
  expect(screen.getByText(/저장하지 않았습니다/)).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
});

// ── 설정: 계정 관리 ─────────────────────────────────────────
async function renderSettings() {
  vi.spyOn(api, "get").mockImplementation(async (path: string) =>
    (path === "/api/health"
      ? { status: "ok", profile: "local", corpus_loaded: 57, detector_ready: true, langgraph: true }
      : { default: "p", presets: [] }) as never);
  await act(async () => { render(<MemoryRouter><Settings /></MemoryRouter>); });
}

it("설정에 비밀번호 변경과 회원 탈퇴가 있다", async () => {
  await renderSettings();
  expect(screen.getByLabelText("현재 비밀번호")).toBeTruthy();
  expect(screen.getByLabelText("새 비밀번호")).toBeTruthy();
  expect(screen.getByRole("button", { name: "회원 탈퇴" })).toBeTruthy();
  // 무엇이 지워지는지 먼저 말한다 — 진단 기록에는 고객사 지시문이 들어 있다
  expect(screen.getByText(/이 계정으로 저장된 진단 기록 전부/)).toBeTruthy();
});

it("새 비밀번호가 서로 다르면 서버를 부르지 않는다", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue(undefined as never);
  await renderSettings();
  fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "abcd1234" } });
  fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "qwer5678" } });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "qwer0000" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" })); });
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByText("새 비밀번호가 일치하지 않습니다.")).toBeTruthy();
});

it("탈퇴는 비밀번호를 받은 뒤에만 요청되고, 성공하면 이 탭의 로그인을 비운다", async () => {
  const del = vi.spyOn(api, "del").mockResolvedValue(undefined as never);
  await renderSettings();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" })); });

  const confirm = screen.getByRole("button", { name: "영구 삭제" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);                       // 비밀번호 없이는 누를 수 없다
  fireEvent.change(screen.getByLabelText("확인을 위해 비밀번호를 입력하세요"), { target: { value: "abcd1234" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "영구 삭제" })); });

  expect(del).toHaveBeenCalledWith("/api/me", { password: "abcd1234" });
  expect(authed.forgetLogin).toHaveBeenCalled();
});
