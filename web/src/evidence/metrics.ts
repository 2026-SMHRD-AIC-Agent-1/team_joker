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
  steps?: { label: string; value: string; detail: string }[];
  steps_note?: string;
}
export interface Metrics { updated: string; metrics: Metric[]; limitations: string[] }

export const METRICS: Metrics = raw as Metrics;

export function metric(key: string): Metric | undefined {
  return METRICS.metrics.find((m) => m.key === key);
}

/**
 * 카드가 무엇을 '짝지어' 보여 주는지만 정한다(Streamlit TOOL_EVIDENCE 와 같은 규칙).
 * ★ 공격 성공률(asr)은 정상 업무 통과율(benign_pass)과 한 카드에서만, **둘 다 있을 때만** 나온다.
 *   ASR 만 크게 띄우면 "거절을 늘려서 내린 것 아니냐" 에 답이 없는 화면이 된다.
 */
export const TOOL_EVIDENCE: { title: string; keys: string[]; needAll: boolean }[] = [
  { title: "지시문 보강", keys: ["asr", "benign_pass"], needAll: true },
  { title: "보강 + 탐지기, 두 층 함께", keys: ["defense_matrix"], needAll: false },
  { title: "JOKER-KO 탐지기", keys: ["ood_recall", "fpr"], needAll: false },
];

export function evidenceCards(m: Metrics = METRICS) {
  const by = new Map(m.metrics.map((x) => [x.key, x]));
  return TOOL_EVIDENCE.flatMap(({ title, keys, needAll }) => {
    const rows = keys.map((k) => by.get(k)).filter((x): x is Metric => Boolean(x));
    if (!rows.length || (needAll && rows.length !== keys.length)) return [];
    return [{ title, rows }];
  });
}

/** 대화상자 순서: 카드 순서대로, 나머지는 뒤. */
export function orderedMetrics(m: Metrics = METRICS): Metric[] {
  const order = TOOL_EVIDENCE.flatMap((c) => c.keys);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...m.metrics].sort((a, b) => rank(a.key) - rank(b.key));
}
