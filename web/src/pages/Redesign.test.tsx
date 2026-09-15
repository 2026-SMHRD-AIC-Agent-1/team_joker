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

it.each([
  ['completed', '공격 8건을 추가로 검사했습니다.', 4, 2],
  ['no_targets', '추가 검사 대상이 없습니다.', null, null],
  ['unavailable', '규칙 검사 결과만 제공합니다.', null, null],
  ['failed', '규칙 검사 결과만 제공합니다.', null, null],
  ['not_recorded', 'ML 검사 기록 없음', null, null],
] as const)('보강안 탭에서 저장된 필터 상태 %s를 렌더한다', (status, message, ml, missed) => {
  const fixture = structuredClone(run);
  fixture.report!.filter_recommendation = {residual: status === 'no_targets' ? 0 : 8, rule_blockable:2,
    status, ml_additional:ml, undetected:missed, detected_total:6, checked:status === 'completed' ? 8 : 0,
    unchecked:status === 'completed' ? 0 : 8, flags:{}, note:'저장된 합계 6건', basis:'rules_and_ml'};
  render(<MemoryRouter initialEntries={['/runs/test?section=2']}><ReportBody run={fixture} onSignup={()=>{}} focusFindings={false}/></MemoryRouter>);
  const detail = screen.getByTestId('filter-detail');
  expect(detail.textContent).toContain(message);
  expect(detail.textContent).toContain('운영 서비스에 필터가 적용된 상태는 아닙니다');
  if (status === 'completed') {
    expect(detail.textContent).toContain('4건');
    expect(detail.textContent).toContain('저장된 합계 6건');
  } else {
    expect(detail.textContent).toContain('미검사');
    expect(detail.textContent).not.toContain('저장된 합계 6건');
  }
});
