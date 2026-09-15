// 대시보드 요약 도형 — 도넛 · 가로 막대 · 세로 막대.
//
// ★ 여기 들어가는 값은 전부 GET /api/runs 의 행에서 세거나 평균 낸 것이다.
//   '보안 취약점 유형', '위험도', '모델별 탐지율' 같은 항목은 서버가 주지 않는다 → 만들지 않는다.
// ★ 그림의 크기는 값에서만 나온다. 값이 0 이면 조각도 막대도 0 이다(최소 길이를 주지 않는다).
// ★ 표본이 적으면 적다고 쓴다 — 모델별 칸에 n 을 함께 적는다.
import type { RunRow } from "../api/types";
import { comparableRun } from "../lib/format";
import { FINDING_ORDER } from "../lib/findings";
import { FINDING_META, GRADE_COLOR } from "../lib/meta";

const GRADES = ["A", "B", "C", "D", "F"] as const;

/** 발견 항목 상태 분포 — 여섯 상태를 전부 그린다(0건도 범례에 남긴다). */
export function FindingsDonut({ runs }: { runs: RunRow[] }) {
  const counts = FINDING_ORDER.map((k) => ({
    key: k, name: FINDING_META[k].name, color: FINDING_META[k].color,
    n: runs.reduce((s, r) => s + Number((r as unknown as Record<string, number>)[k] ?? 0), 0),
  }));
  const total = counts.reduce((s, c) => s + c.n, 0);
  if (!total) return null;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="chart-card">
      <div className="cc-t">발견 항목 상태 분포</div>
      <div className="donut-wrap">
        <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`발견 항목 ${total}건의 상태 분포`}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="#E6EBF3" strokeWidth="18" />
          {counts.filter((c) => c.n).map((c) => {
            const len = (c.n / total) * C;
            const el = <circle key={c.key} cx="70" cy="70" r={R} fill="none" stroke={c.color} strokeWidth="18"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
            acc += len;
            return el;
          })}
          <text x="70" y="66" textAnchor="middle" className="donut-n">{total}</text>
          <text x="70" y="84" textAnchor="middle" className="donut-l">건</text>
        </svg>
        <ul className="legend">
          {counts.map((c) => (
            <li key={c.key}>
              <i style={{ background: c.color }} />
              <span className="lg-n">{c.name}</span>
              <b className="num">{c.n}</b>
              <em>{total ? Math.round((c.n / total) * 100) : 0}%</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 등급 분포 — 등급이 매겨진 진단만. 보류된 진단은 따로 적는다(0으로 섞지 않는다). */
export function GradeBars({ runs }: { runs: RunRow[] }) {
  const rows = GRADES.map((g) => ({ g, n: runs.filter((r) => r.grade === g).length }));
  const held = runs.filter((r) => !r.grade).length;
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.some((r) => r.n) && !held) return null;
  return (
    <div className="chart-card">
      <div className="cc-t">보강안 재시험 등급 분포</div>
      <div className="hbars">
        {rows.map(({ g, n }) => (
          <div className="hb" key={g}>
            <span className="hb-l" style={{ color: GRADE_COLOR[g] }}>{g}</span>
            <span className="hb-track"><span className="hb-fill" style={{ width: `${(n / max) * 100}%`, background: GRADE_COLOR[g] }} /></span>
            <b className="hb-v num">{n}건</b>
          </div>
        ))}
      </div>
      {held ? <p className="cc-note">등급 보류 {held}건은 위 분포에서 뺐습니다 — 판정하지 못한 건을 0으로 섞지 않습니다.</p> : null}
    </div>
  );
}

/** 대상 모델별 보강 후 공격 성공률 — 낮을수록 좋다. 모델마다 표본 수(n)를 함께 적는다. */
export function ModelBars({ runs }: { runs: RunRow[] }) {
  const by = new Map<string, number[]>();
  for (const r of runs) {
    if (!comparableRun(r) || typeof r.asr_after !== "number") continue;
    const m = r.target_model || "알 수 없음";
    by.set(m, [...(by.get(m) ?? []), r.asr_after]);
  }
  const rows = [...by.entries()]
    .map(([m, xs]) => ({ m, n: xs.length, avg: (xs.reduce((a, b) => a + b, 0) / xs.length) * 100 }))
    .sort((a, b) => a.avg - b.avg).slice(0, 5);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.avg));
  return (
    <div className="chart-card">
      <div className="cc-t">대상 모델별 보강 후 공격 성공률</div>
      <div className="vbars">
        {rows.map((r) => (
          <div className="vb" key={r.m}>
            <b className="vb-v num">{r.avg.toFixed(0)}%</b>
            <span className="vb-track"><span className="vb-fill" style={{ height: `${(r.avg / max) * 100}%` }} /></span>
            <span className="vb-l" title={r.m}>{r.m}</span>
            <span className="vb-n">n={r.n}</span>
          </div>
        ))}
      </div>
      <p className="cc-note">낮을수록 좋습니다. 비교 가능한 진단의 평균이며, 모델마다 표본 수가 다릅니다.</p>
    </div>
  );
}
