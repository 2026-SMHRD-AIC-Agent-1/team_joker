// 화면에 띄우는 실측 수치 — data/evidence/headline_metrics.json 하나에서만 온다.
// ★ 빌드할 때 그 파일을 그대로 가져온다. 화면 코드에 숫자를 적으면 재측정 때 화면과 근거가
//   조용히 어긋난다(tests/test_web_guard.py 가 숫자 하드코딩을 막는다).
import raw from "../../../data/evidence/headline_metrics.json";

export interface Metric {
  key: string;
  label: string;
  value: string;
  detail: string;
  condition: string;
  source: string;
  summary?: string;
  steps?: { label: string; value: string; detail: string }[];
  steps_note?: string;
}
export interface Metrics { updated: string; metrics: Metric[]; limitations: string[] }

export const METRICS: Metrics = raw as Metrics;

/** 원본 측정값은 보존하고, 공개 근거의 정보 유출 방어율만 100 − ASR로 표시한다. */
export function displayMetric(m: Metric): Metric {
  if (m.key === "asr") {
    const match = m.value.match(/^(\d+(?:\.\d+)?)%\s*→\s*(\d+(?:\.\d+)?)%$/);
    if (!match || match.slice(1).some(v => Number(v) > 100)) return m;
    return { ...m, label: "정보 유출 방어율 · 수정 전 → 후",
      value: match.slice(1).map(v => `${(100 - Number(v)).toFixed(1)}%`).join(" → "),
      summary: "시험에서 정보가 유출되지 않은 비율 · 높을수록 좋습니다.",
      detail: `방어율 = 100% − 공격 성공률(${m.value}). ${m.detail}` };
  }
  const copy: Record<string, [string, string]> = {
    benign_pass: ["일반 질문 응답률 · 수정 전 → 후", "방어 규칙을 추가한 뒤에도 일반 질문에 답했는지 확인했습니다."],
    ood_recall: ["새로운 공격을 찾아낸 비율", "학습용으로 만든 문장과 다른 공격으로 시험했습니다."],
    fpr: ["일반 메시지를 공격으로 잘못 판단", "일반 메시지를 불필요하게 막는지 확인했습니다."],
    defense_matrix: ["규칙 수정 + 메시지 검사 후 정보 유출", "같은 공격 50건을 시험한 결과이며, 모든 공격의 차단을 보장하지 않습니다."],
    public_detector: ["다른 탐지 모델과 비교", "일반 메시지를 잘못 막지 않는 조건에서 비교했습니다."],
  };
  const text = copy[m.key];
  return text ? { ...m, label: text[0], summary: text[1] } : m;
}

export function metric(key: string): Metric | undefined {
  const m = METRICS.metrics.find((m) => m.key === key);
  return m ? displayMetric(m) : undefined;
}

/**
 * 카드가 무엇을 '짝지어' 보여 주는지만 정한다(Streamlit TOOL_EVIDENCE 와 같은 규칙).
 * ★ 공격 성공률(asr)은 정상 업무 통과율(benign_pass)과 한 카드에서만, **둘 다 있을 때만** 나온다.
 *   ASR 만 크게 띄우면 "거절을 늘려서 내린 것 아니냐" 에 답이 없는 화면이 된다.
 */
export const TOOL_EVIDENCE: { title: string; keys: string[]; needAll: boolean }[] = [
  { title: "규칙 수정 전후", keys: ["asr", "benign_pass"], needAll: true },
  { title: "규칙 수정과 메시지 검사", keys: ["defense_matrix"], needAll: false },
  { title: "의심 메시지를 찾는 성능", keys: ["ood_recall", "fpr"], needAll: false },
  // ★ 0914: 비교 기준이 없는 수치는 성과를 말하지 못한다(현직자 피드백) — 공개 탐지기와 같은 조건에서의 위치.
  { title: "공개 탐지기와 같은 조건에서", keys: ["public_detector"], needAll: false },
];

export function evidenceCards(m: Metrics = METRICS) {
  const by = new Map(m.metrics.map((x) => [x.key, x]));
  return TOOL_EVIDENCE.flatMap(({ title, keys, needAll }) => {
    const rows = keys.map((k) => by.get(k)).filter((x): x is Metric => Boolean(x));
    if (!rows.length || (needAll && rows.length !== keys.length)) return [];
    return [{ title, rows: rows.map(displayMetric) }];
  });
}

/** 대화상자 순서: 카드 순서대로, 나머지는 뒤. */
export function orderedMetrics(m: Metrics = METRICS): Metric[] {
  const order = TOOL_EVIDENCE.flatMap((c) => c.keys);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...m.metrics].sort((a, b) => rank(a.key) - rank(b.key)).map(displayMetric);
}
