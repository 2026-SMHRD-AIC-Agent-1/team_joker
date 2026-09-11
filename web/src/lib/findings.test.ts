import { describe, expect, it } from "vitest";
import type { Attempt, Report } from "../api/types";
import { deltaView, techBar } from "./delta";
import { diffLines } from "./diff";
import { buildFindings, currentChannel, defaultStates, filterFindings, findingState, residualSample } from "./findings";

const att = (id: string, round: 1 | 2, verdict: string, extra: Partial<Attempt> = {}): Attempt => ({
  attack_id: id, technique: "AUTH", technique_ko: "권위", goal: "INFO_LEAK", round_no: round, verdict,
  verdict_by: "rule", leak_channel: verdict === "leak" ? "plain" : null, rendered_text: `${id} 문구`, ...extra,
});

describe("발견 항목 상태 — 서버 serialize.finding_state 와 같은 규칙", () => {
  it("6가지 상태", () => {
    expect(findingState("leak", "leak")).toBe("unresolved");
    expect(findingState("leak", "block")).toBe("resolved");
    expect(findingState("block", "leak")).toBe("regressed");
    expect(findingState("block", "block")).toBe("unaffected");
    expect(findingState("leak", null)).toBe("no_retry");
    expect(findingState("gray", "block")).toBe("unjudged");
  });

  it("공격 1건 = 발견 항목 1건, 두 라운드를 한 쌍으로 묶는다", () => {
    const f = buildFindings([att("A", 1, "leak"), att("A", 2, "block"), att("B", 1, "block"), att("B", 2, "leak")]);
    expect(f.map((x) => [x.id, x.state])).toEqual([["A", "resolved"], ["B", "regressed"]]);
  });

  it("비회원(attempts=[])이면 목록도, 탐지기로 넘길 문구도 없다", () => {
    expect(buildFindings([])).toEqual([]);
    expect(residualSample({ attempts: [] } as unknown as Report)).toBe("");
  });

  it("깨끗한 진단은 전체 상태를 켜 둔다(빈 목록으로 진단이 안 돈 것처럼 보이지 않게)", () => {
    const clean = buildFindings([att("A", 1, "leak"), att("A", 2, "block")]);
    expect(defaultStates(clean)).toHaveLength(6);
    const risky = buildFindings([att("A", 1, "leak"), att("A", 2, "leak")]);
    expect(defaultStates(risky)).not.toContain("resolved");
  });

  it("검색은 ID·기법·문구만, 정렬은 위험한 상태가 먼저", () => {
    const f = buildFindings([att("B", 1, "leak"), att("B", 2, "block"), att("A", 1, "leak", { rendered_text: "특별한 문구" }), att("A", 2, "leak", { rendered_text: "특별한 문구" })]);
    expect(filterFindings(f, { states: [], techs: [], q: "" }).map((x) => x.id)).toEqual(["A", "B"]);
    expect(filterFindings(f, { states: [], techs: [], q: "특별" }).map((x) => x.id)).toEqual(["A"]);
  });

  it("해결된 항목에는 유출 채널을 찍지 않는다(보강 전 채널이 현재처럼 읽힌다)", () => {
    const [f] = buildFindings([att("A", 1, "leak"), att("A", 2, "block")]);
    expect(currentChannel(f)).toBe("—");
  });
});

describe("변화량 — abs() 로 뭉개지 않는다", () => {
  it("개선은 ▼, 악화는 ▲ 이고 악화를 개선으로 칠하지 않는다", () => {
    expect(deltaView({ comparable: true, asr_before: 0.5, asr_after: 0.1, asr_delta: 0.4 })).toMatchObject({ value: "▼ 40.0%p", tone: "down" });
    const worse = deltaView({ comparable: true, asr_before: 0.1, asr_after: 0.5, asr_delta: -0.4 });
    expect(worse).toMatchObject({ value: "▲ 40.0%p", tone: "up", worse: true });
  });
  it("비교 불가·값 없음은 0 으로 대체하지 않는다", () => {
    expect(deltaView({ comparable: false, asr_before: 0.5, asr_after: 0.1, asr_delta: 0.4 }).value).toBe("비교 불가");
    expect(deltaView({ comparable: true, asr_before: null, asr_after: 0.1, asr_delta: null }).value).toBe("측정 불가");
  });
  it("기법 막대: 나빠진 기법은 위험색 + ▲", () => {
    expect(techBar({ technique: "X", technique_ko: "x", before: 0.2, after: 0.6, total: 5 })).toMatchObject({ cls: "tb-bad", mark: "▲" });
    expect(techBar({ technique: "X", technique_ko: "x", before: null, after: 0.6, total: 5 }).kind).toBe("na");
  });
});

describe("원본 → 보강안 줄 비교", () => {
  it("추가·삭제·유지를 기호로 표시하고, 한 덩어리 안에서는 빠진 줄이 먼저", () => {
    const rows = diffLines("가\n나\n다", "가\n라\n다\n마");
    expect(rows.map((r) => r.mk + r.text)).toEqual(["=가", "−나", "＋라", "=다", "＋마"]);
  });
});
