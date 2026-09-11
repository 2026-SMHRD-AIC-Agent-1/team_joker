// 보강 전 → 후 변화량과 기법별 막대. ★ 값을 만들지 않는다 — 받은 값의 뺄셈과 방향만 정한다.
import type { Report, TechniqueRow } from "../api/types";

export interface DeltaView { value: string; tone: "down" | "up" | "na"; why: string; worse: boolean }

/**
 * asr_delta = asr_before - asr_after (nodes/report.py). 양수면 개선(감소), 음수면 악화(증가).
 * ★ abs() 로 뭉개지 않는다 — 악화된 진단을 개선처럼 칠하던 버그가 실제로 있었다(0910).
 * ★ 비교가 안 되거나 값이 없으면 0 으로 대체하지 않는다. 0 을 찍으면 '변화 없음' 을 화면이 지어낸다.
 * ★ 단위: 성공률은 %, 그 차이는 %p.
 */
export function deltaView(rep: Pick<Report, "comparable" | "asr_before" | "asr_after" | "asr_delta">): DeltaView {
  if (rep.comparable === false) {
    return { value: "비교 불가", tone: "na", worse: false,
      why: "보강 전·후가 서로 다른 공격 집합으로 실행돼 변화량을 계산할 수 없습니다." };
  }
  const { asr_before: before, asr_after: after } = rep;
  if (typeof before !== "number" || typeof after !== "number") {
    return { value: "측정 불가", tone: "na", worse: false, why: "보강 전 또는 보강 후의 공격 성공률이 없습니다." };
  }
  const pp = (typeof rep.asr_delta === "number" ? rep.asr_delta : before - after) * 100;
  if (Math.abs(pp) < 0.05) return { value: "변화 없음", tone: "na", worse: false, why: "보강 전후의 공격 성공률이 같습니다." };
  if (pp > 0) return { value: `▼ ${pp.toFixed(1)}%p`, tone: "down", worse: false, why: "보강 후 공격 성공률이 낮아졌습니다(개선)." };
  return { value: `▲ ${Math.abs(pp).toFixed(1)}%p`, tone: "up", worse: true,
    why: "보강 후 공격 성공률이 높아졌습니다(악화). 보강안을 그대로 적용하기 전에 ‘보강 후 신규’ 항목을 먼저 확인하세요." };
}

export type TechBar =
  | { kind: "na"; name: string }
  | { kind: "bar"; name: string; before: number; after: number; cls: "tb-good" | "tb-bad" | "tb-flat"; mark: "▼" | "▲" | "=" };

/**
 * 기법별 보강 전/후. ★ '보강 후' 를 무조건 초록으로 칠하지 않는다 — 색은 위치가 아니라 의미를 따른다.
 * 색만으로 말하지 않도록 ▲▼= 기호도 같이 준다.
 */
export function techBar(r: TechniqueRow): TechBar {
  if (typeof r.before !== "number" || typeof r.after !== "number") return { kind: "na", name: r.technique_ko };
  const before = r.before * 100;
  const after = r.after * 100;
  const [cls, mark] = after < before - 0.5 ? ["tb-good", "▼"] as const
    : after > before + 0.5 ? ["tb-bad", "▲"] as const : ["tb-flat", "="] as const;
  return { kind: "bar", name: r.technique_ko, before, after, cls, mark };
}
