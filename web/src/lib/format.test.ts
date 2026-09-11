import { describe, expect, it } from "vitest";
import { actionRequired, direction, fmtPct } from "./format";

describe("보강 전 → 후 방향", () => {
  it("나빠진 진단을 개선으로 칠하지 않는다(abs 금지)", () => {
    expect(direction(0.2, 0.6)).toBe("worse");
    expect(direction(0.6, 0.2)).toBe("better");
    expect(direction(0.5, 0.5)).toBe("same");
  });
  it("비교 불가면 방향을 정하지 않는다", () => {
    expect(direction(0.6, 0.2, 0)).toBe("incomparable");
    expect(direction(0.6, 0.2, false)).toBe("incomparable");
  });
  it("값이 없으면 지어내지 않는다", () => {
    expect(direction(null, 0.2)).toBe("unknown");
    expect(fmtPct(null)).toBe("-");
  });
});

describe("조치 필요 건수", () => {
  it("서버가 준 action_required 를 쓴다(regressed 누락 방지)", () => {
    expect(actionRequired({ run_id: "r", created_at: "", grade: null, asr_before: null, asr_after: null,
      unresolved: 0, regressed: 3, action_required: 3 })).toBe(3);
  });
  it("옛 응답이면 미해결 + 보강 후 신규를 더한다", () => {
    expect(actionRequired({ run_id: "r", created_at: "", grade: null, asr_before: null, asr_after: null,
      unresolved: 1, regressed: 2 })).toBe(3);
  });
});
