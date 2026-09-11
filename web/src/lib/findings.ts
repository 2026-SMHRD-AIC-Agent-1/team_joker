// 발견 항목(Finding) = 공격 1건(attack_id)의 보강 전(r1) · 보강 후(r2) 한 쌍.
// ★ 상태는 round_no × verdict 에서 파생될 뿐 새로 지어낸 등급이 아니다. 서버(serialize.finding_state)와
//   Streamlit 화면과 같은 규칙이고, 6개 상태의 합이 항상 전체 건수와 같다.
import type { Attempt, FindingState, Report } from "../api/types";
import { FINDING_META } from "./meta";

export const FINDING_ORDER: FindingState[] = ["unresolved", "regressed", "unjudged", "resolved", "unaffected", "no_retry"];
/** 처음 열었을 때 켜 두는 필터 — 지금 조치·재검증이 필요한 상태. */
export const DEFAULT_FINDING_FILTER: FindingState[] = ["unresolved", "regressed", "unjudged", "no_retry"];

export const CHANNEL_KO: Record<string, string> = {
  plain: "평문 그대로", reversed: "뒤집기", base64: "인코딩",
  semantic: "의미상 유출", jamo: "자모 분해", segmented: "조각 유출",
};
export const VERDICT_BY_KO: Record<string, string> = { rule: "규칙", llm: "LLM 심판" };
export const GOAL_KO: Record<string, string> = {
  INFO_LEAK: "비밀값 유출", POLICY_BREAK: "금지된 행동 수행", PERSONA_BREAK: "역할 이탈",
};

export function findingState(v1: string | null | undefined, v2: string | null | undefined): FindingState {
  if (v1 == null || v2 == null) return "no_retry";
  if (!["leak", "block"].includes(v1) || !["leak", "block"].includes(v2)) return "unjudged";
  if (v1 === "leak") return v2 === "leak" ? "unresolved" : "resolved";
  return v2 === "leak" ? "regressed" : "unaffected";
}

export interface Finding {
  id: string;
  state: FindingState;
  technique: string;
  techniqueKo: string;
  goal: string | null;
  r1: Attempt | null;
  r2: Attempt | null;
  text: string;
  channel: string | null;
  verdictBy: string | null;
}

/** attempts(회원에게만 온다) → attack_id 단위 발견 항목. 비회원은 attempts=[] 라 빈 목록이 된다. */
export function buildFindings(attempts: Attempt[] | undefined | null): Finding[] {
  const by = new Map<string, { 1?: Attempt; 2?: Attempt }>();
  for (const a of attempts ?? []) {
    const cur = by.get(a.attack_id) ?? {};
    cur[a.round_no] = a;
    by.set(a.attack_id, cur);
  }
  const out: Finding[] = [];
  by.forEach((rounds, id) => {
    const r1 = rounds[1] ?? null;
    const r2 = rounds[2] ?? null;
    const base = r1 ?? r2;
    const leaked = r2?.verdict === "leak" ? r2 : r1?.verdict === "leak" ? r1 : null;
    out.push({
      id,
      state: findingState(r1?.verdict, r2?.verdict),
      technique: base?.technique ?? "",
      techniqueKo: base?.technique_ko ?? "",
      goal: base?.goal ?? null,
      r1, r2,
      text: base?.rendered_text ?? "",
      channel: leaked?.leak_channel ?? null,
      verdictBy: (leaked ?? base)?.verdict_by ?? null,
    });
  });
  return out;
}

/**
 * 처음 켜 둘 상태. 조치가 필요한 항목이 하나라도 있으면 그 상태만, 하나도 없으면 전체.
 * ★ 깨끗한 진단에서 기본 필터를 그대로 두면 '해당 항목이 없습니다' 만 떠서 진단이 안 돈 것처럼 읽힌다.
 */
export function defaultStates(findings: Finding[]): FindingState[] {
  return findings.some((f) => DEFAULT_FINDING_FILTER.includes(f.state)) ? [...DEFAULT_FINDING_FILTER] : [...FINDING_ORDER];
}

export interface FindingFilter { states: FindingState[]; techs: string[]; q: string }

/**
 * 필터·검색·정렬. ★ 검색 대상은 화면이 이미 가진 값(공격 ID · 기법명 · 공격 문구)뿐이다.
 * 비회원에게는 attempts 가 오지 않으므로 검색으로 잠긴 데이터가 새는 경로가 없다.
 */
export function filterFindings(findings: Finding[], f: FindingFilter): Finding[] {
  const keep = new Set(f.states.length ? f.states : FINDING_ORDER);
  const techs = new Set(f.techs);
  const q = f.q.trim().toLowerCase();
  return findings
    .filter((x) => keep.has(x.state))
    .filter((x) => !techs.size || techs.has(x.techniqueKo))
    .filter((x) => !q || [x.id, x.techniqueKo, x.technique, x.text].some((v) => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => FINDING_ORDER.indexOf(a.state) - FINDING_ORDER.indexOf(b.state)
      || a.technique.localeCompare(b.technique) || a.id.localeCompare(b.id));
}

/**
 * 유출 채널은 '지금 유출 중인' 항목에만 쓴다. 해결된 항목에까지 찍으면 보강 전 채널이
 * 현재 상태처럼 읽힌다(표에서 가장 흔한 거짓말이다).
 */
export function currentChannel(f: Finding): string {
  if (f.state !== "unresolved" && f.state !== "regressed") return "—";
  return f.channel ? (CHANNEL_KO[f.channel] ?? f.channel) : "—";
}

export const stateName = (s: FindingState) => FINDING_META[s].name;

/** 조치가 필요한 건수 — 서버 값(report.action_required)이 1순위. regressed 를 빠뜨리지 않는다. */
export function reportActionRequired(rep: Report): number {
  if (rep.action_required !== undefined && rep.action_required !== null) return Number(rep.action_required);
  const fs = rep.findings_summary;
  return (fs?.unresolved ?? 0) + (fs?.regressed ?? 0) + (fs?.unjudged ?? 0) + (fs?.no_retry ?? 0);
}

export function verdictLine(r: Attempt): string {
  if (r.verdict_reason) return r.verdict_reason;
  if (r.verdict !== "leak" && r.verdict !== "block") return "판정 불가: 재검증이 필요합니다.";
  return "상세 판정 근거가 기록되지 않았습니다.";
}

/**
 * 보강 후에도 뚫린 공격 1건의 실제 문구 — 탐지 화면에 미리 넣어 줄 값.
 * ★ attempts 는 회원 응답에만 있다. 비회원이면 빈 문자열 — 게이팅 경계를 화면이 우회하지 않는다.
 */
export function residualSample(rep: Report): string {
  const a = (rep.attempts ?? []).find((x) => x.round_no === 2 && x.verdict === "leak");
  return (a?.rendered_text ?? "").slice(0, 300);
}
