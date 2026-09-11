import { describe, expect, it } from "vitest";
import { evidenceCards, METRICS, orderedMetrics } from "./metrics";
import type { Metrics } from "./metrics";

describe("검증 근거 카드", () => {
  it("실제 json 으로 카드 3개, 공격 성공률은 정상 업무 통과율과 같은 카드", () => {
    const cards = evidenceCards();
    expect(cards).toHaveLength(3);
    const first = cards[0].rows.map((r) => r.key);
    expect(first).toEqual(["asr", "benign_pass"]);
  });
  it("정상 업무 통과율이 없으면 공격 성공률 카드째 뺀다", () => {
    const m: Metrics = { ...METRICS, metrics: METRICS.metrics.filter((x) => x.key !== "benign_pass") };
    const keys = evidenceCards(m).flatMap((c) => c.rows.map((r) => r.key));
    expect(keys).not.toContain("asr");
  });
  it("json 에 없는 key 의 칸은 그리지 않는다", () => {
    const m: Metrics = { ...METRICS, metrics: METRICS.metrics.filter((x) => x.key === "ood_recall") };
    expect(evidenceCards(m)).toHaveLength(1);
  });
  it("모든 지표는 측정 조건과 출처를 갖는다", () => {
    for (const x of METRICS.metrics) {
      expect(x.condition.length).toBeGreaterThan(10);
      expect(x.source).toBeTruthy();
    }
    expect(orderedMetrics()[0].key).toBe("asr");
  });
});
