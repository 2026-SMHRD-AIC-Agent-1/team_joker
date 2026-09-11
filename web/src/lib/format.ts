// 숫자를 글자로 바꾸는 규칙. ★ 여기서 값을 만들지 않는다 — 받은 값을 보여 줄 뿐이다.
import type { RunRow } from "../api/types";

export const fmtPct = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "-";

export type Direction = "better" | "worse" | "same" | "incomparable" | "unknown";

/**
 * 보강 전 → 후의 방향.
 * ★ abs() 로 뭉개지 않는다 — 나빠진 진단을 개선처럼 칠하던 버그가 실제로 있었다(0910).
 * ★ 비교 불가(comparable=0)면 방향을 정하지 않는다 — 다른 공격 집합의 두 수에 개선/악화를 칠하면
 *   없는 결론이 생긴다.
 */
export function direction(before: number | null | undefined, after: number | null | undefined,
                          comparable?: number | boolean | null): Direction {
  if (typeof before !== "number" || typeof after !== "number") return "unknown";
  if (comparable !== undefined && comparable !== null && !comparable) return "incomparable";
  if (after < before - 0.005) return "better";
  if (after > before + 0.005) return "worse";
  return "same";
}

/** 목록 행의 조치 필요 건수. 서버가 준 action_required 를 쓴다(regressed 누락 방지 · 계약 v0.7). */
export function actionRequired(r: RunRow): number {
  if (r.action_required !== undefined && r.action_required !== null) return Number(r.action_required);
  return Number(r.unresolved ?? 0) + Number(r.regressed ?? 0);
}

export const isMock = (r: { backend?: string }) => r.backend === "mock";

export function comparableRun(r: RunRow): boolean {
  return r.comparable === undefined || r.comparable === null || Boolean(r.comparable);
}
