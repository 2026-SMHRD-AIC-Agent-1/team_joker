import { describe, expect, it } from "vitest";
import type { RunRow } from "../api/types";
import { avgText, dashStats } from "./Dashboard";

const row = (p: Partial<RunRow>): RunRow => ({ run_id: "r", created_at: "", grade: "B", asr_before: 0.5, asr_after: 0.1, ...p });

describe("대시보드 집계", () => {
  it("mock 런은 집계에서 뺀다(항상 100%→0% 라 좋아 보인다)", () => {
    const s = dashStats([row({ backend: "mock", grade: "A", asr_before: 1, asr_after: 0 }), row({ backend: "local" })]);
    expect(s.real).toHaveLength(1);
    expect(s.mockN).toBe(1);
    expect(s.latest?.grade).toBe("B");
  });
  it("비교 불가 진단은 평균 변화량에서 뺀다", () => {
    const s = dashStats([row({ comparable: 0 }), row({ comparable: 1 })]);
    expect(s.deltas).toHaveLength(1);
    expect(s.incomparableN).toBe(1);
  });
  it("악화가 섞이면 평균이 내려간다(abs 금지)", () => {
    expect(avgText([-0.3]).text).toBe("▲ 30%p");
    expect(avgText([0.4]).text).toBe("▼ 40%p");
    expect(avgText([]).text).toBe("-");
  });
});
