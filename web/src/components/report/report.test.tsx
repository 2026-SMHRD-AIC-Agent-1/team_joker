// 게이팅·정직성 동작 테스트. ★ 비회원 화면에 서버가 안 보낸 내용이 생기지 않는지, 진단 불가에 점수가 없는지.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Gated, Report, Run } from "../../api/types";
import { EvidenceCards } from "./Evidence";
import { Findings } from "./Findings";
import { GATE_DECOY } from "./Gate";
import { Inconclusive } from "./Outcomes";
import { Prescription } from "./Prescription";
import { stageRows } from "./Progress";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", profile: "local", detector_ready: true }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const fs = { unresolved: 1, regressed: 0, unjudged: 0, resolved: 2, unaffected: 0, no_retry: 0, total: 3 };
// 서버 serialize._apply_gate 가 비회원에게 보내는 모양 그대로.
const guestReport = {
  grade: "B", comparable: true, asr_before: 1, asr_after: 0.33, asr_delta: 0.67, by_technique: [], applied_patterns: ["P01"],
  findings_summary: fs, action_required: 1, patched_prompt: "첫 줄\n둘째 줄", original_prompt: null, attempts: [],
  representative_findings: [{ attack_id: "AUTH-01", state: "unresolved", title: "관리자 코드 유출이 관측됐습니다", technique_ko: "권위", locked: true }],
} as unknown as Report;
const gated: Gated = { is_gated: true, patched_prompt_total_lines: 12, patched_prompt_hidden_lines: 10,
  attempts_total: 6, attempts_hidden: 6, representative_locked: 1, unlock: "무료 회원가입 시 전체 보강안과 시도별 상세를 볼 수 있습니다." };

describe("비회원 게이팅", () => {
  it("잠긴 대표 카드는 '실행되지 않았습니다' 라고 거짓말하지 않고, 잠겼다고 말한다", () => {
    render(<EvidenceCards rep={guestReport} gated={gated} onSignup={() => {}} />);
    expect(screen.queryByText("이 라운드는 실행되지 않았습니다.")).toBeNull();
    expect(screen.getByText(/실제 공격 문구는 무료 가입 후 확인할 수 있습니다/)).toBeTruthy();
    expect(screen.getByText("1건")).toBeTruthy(); // 가려진 양을 숫자로
  });

  it("흐린 줄은 화면이 만든 고정 문장뿐이다", () => {
    const { container } = render(<EvidenceCards rep={guestReport} gated={gated} onSignup={() => {}} />);
    const blurred = [...container.querySelectorAll(".gate-blur .gb-l")].map((n) => n.textContent);
    expect(blurred).toEqual([...GATE_DECOY.attempts]);
    expect(screen.getByText(/화면이 만든 예시 문장/)).toBeTruthy();
    expect(screen.getByText(/애초에 담기지 않습니다/)).toBeTruthy();
  });

  it("보강안: 앞 2줄만, 전문 복사 버튼 없음, 원본 비교는 잠김 안내", () => {
    render(<Prescription rep={guestReport} gated={gated} onSignup={() => {}} />);
    expect(screen.queryByRole("button", { name: "보강안 전문 복사" })).toBeNull();
    expect(screen.getByTestId("patched").textContent).toBe("첫 줄\n둘째 줄");
    expect(screen.getByText("10줄")).toBeTruthy();
    expect(screen.getByText(/원본은 비회원 응답에 담기지 않으므로/)).toBeTruthy();
    expect(screen.getByText(/정상 업무까지 거절하지 않는지도 확인해야 합니다/)).toBeTruthy();
  });

  it("발견 항목 표 대신 게이트가 나온다(검색으로 새는 경로 없음)", () => {
    render(<MemoryRouter><Findings runId="r1" rep={guestReport} gated={gated} onSignup={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByTestId("gate")).toBeTruthy();
  });
});

describe("진단 불가", () => {
  it("등급·공격 성공률을 그리지 않고 '안전함' 이 아니라고 말한다", () => {
    const run = { run_id: "r1", status: "inconclusive", target: { model: "m", backend: "local", fidelity: "proxy_model", scope_notice: "s" },
      report: { inconclusive: true, reason: "보호할 비밀값 자산을 찾지 못했습니다.", grade: "A", asr_before: 0, asr_after: 0 } } as unknown as Run;
    const { container } = render(<Inconclusive run={run} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/‘안전함’ 을 뜻하지 않습니다/);
    expect(text).not.toMatch(/등급\s*A|0%/);
  });
});

describe("진행 표시", () => {
  it("퍼센트 없이 서버가 센 값만", () => {
    const rows = stageRows({ stage_index: 1, stage_done: 6, stage_total: 39, calls_done: 24,
      stages: [{ key: "recon", label: "" }, { key: "attack_r1", label: "" }, { key: "patch", label: "" }] });
    expect(rows.map((r) => r.state)).toEqual(["done", "cur", "todo"]);
    expect(rows[1].detail).toBe("공격 24건 실행 · 이번 묶음 6/39");
    expect(rows.map((r) => r.detail).join("")).not.toContain("%");
  });
});
