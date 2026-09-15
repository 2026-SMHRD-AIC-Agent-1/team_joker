import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Landing } from "./Landing";
import { ReportBody } from "./RunPage";
import type { Run } from "../api/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("첫 화면은 로그인 폼 대신 서비스 소개와 무료 진단 링크를 보여준다", () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("지켜야 할 정보");
  expect(screen.queryByLabelText("비밀번호")).toBeNull();
  expect(screen.getByRole("link", { name: "무료로 진단 시작하기 →" }).getAttribute("href")).toBe("/diagnose");
  // ★ 내부 이동에 ↗(외부 링크 관용 기호)를 쓰지 않는다
  expect(document.body.textContent).not.toContain("↗");
  expect(screen.queryByRole("heading", { name: /의심스러운 입력/ })).toBeNull();
});

const run = {
  run_id: "test", status: "done", target: { model: "test", backend: "mock", fidelity: "proxy_model", scope_notice: "test" },
  gated: { is_gated: false }, report: {
    grade: "A", comparable: true, asr_before: 0, asr_after: 0, asr_delta: 0,
    by_technique: [], applied_patterns: [], action_required: 0,
    findings_summary: { unresolved: 0, regressed: 0, resolved: 0, unaffected: 1, no_retry: 0, total: 1 },
    patched_prompt: "TEST PATCH CONTENT", original_prompt: "original", attempts: [],
  },
} as Run;

it("결과는 한 구역만 표시하고 키보드로 구역을 이동한다", () => {
  render(<MemoryRouter><ReportBody run={run} onSignup={() => {}} focusFindings={false} /></MemoryRouter>);
  expect(screen.getByTestId("hero")).toBeTruthy();
  expect(screen.queryByTestId("patched")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: /지시문 보강안/ }));
  expect(screen.getByTestId("patched").textContent).toBe("TEST PATCH CONTENT");
  expect(screen.queryByTestId("hero")).toBeNull();
  fireEvent.keyDown(screen.getByRole("tab", { name: /지시문 보강안/ }), { key: "Home" });
  expect(screen.getByRole("tab", { name: /결과 요약/ }).getAttribute("aria-selected")).toBe("true");
});

it("직접 주소의 구역 선택을 복원한다", () => {
  render(<MemoryRouter initialEntries={["/runs/test?section=2"]}><ReportBody run={run} onSignup={() => {}} focusFindings={false} /></MemoryRouter>);
  expect(screen.getByTestId("patched")).toBeTruthy();
  expect(screen.queryByTestId("hero")).toBeNull();
});
