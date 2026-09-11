// 내 진단들의 보강 전/후 공격 성공률 추이.
// ★ mock·비교 불가 진단은 뺀다. ★ 3회 미만이면 그리지 않는다(점 두 개짜리 추이선은 아무 말도 안 한다).
// ★ 0/50/100% 기준선과 계열 이름을 선 끝에 직접 적는다(색만으로 두 선을 구분하게 만들지 않는다).
import type { RunRow } from "../api/types";
import { comparableRun, isMock } from "../lib/format";

export function trendPoints(runs: RunRow[]): RunRow[] {
  return [...runs].reverse()
    .filter((r) => !isMock(r) && typeof r.asr_before === "number" && typeof r.asr_after === "number" && comparableRun(r))
    .slice(-12);
}

export function TrendChart({ runs }: { runs: RunRow[] }) {
  const pts = trendPoints(runs);
  if (pts.length < 3) return null;
  const w = 1200, h = 190, pl = 52, pr = 66, pt = 16, pb = 30;
  const ix = w - pl - pr, iy = h - pt - pb, step = ix / (pts.length - 1);
  const x = (i: number) => pl + i * step;
  const y = (v: number) => pt + (1 - v) * iy;
  const series = (key: "asr_before" | "asr_after", color: string, width: number, name: string) => {
    const d = pts.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[key] as number).toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1][key] as number;
    return (
      <g key={key}>
        <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" />
        {pts.map((r, i) => <circle key={i} cx={x(i)} cy={y(r[key] as number)} r={3.4} fill={color} />)}
        <text x={w - pr + 6} y={y(last) + 3.5} fontSize={13} fontWeight={700} fill={color}>{Math.round(last * 100)}% {name}</text>
      </g>
    );
  };
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
           aria-label="보강 전·후 공격 성공률 추이">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={pl} y1={y(v)} x2={w - pr} y2={y(v)} stroke="#E8EDF5" />
            <text x={pl - 8} y={y(v) + 3.5} textAnchor="end" fontSize={13} fill="#66758C">{v * 100}%</text>
          </g>
        ))}
        {series("asr_before", "#5C6C83", 1.6, "보강 전")}
        {series("asr_after", "#285DDD", 3.0, "보강 후")}
        <text x={pl} y={h - 6} fontSize={13} fill="#66758C">오래된 진단</text>
        <text x={w - pr} y={h - 6} fontSize={13} fill="#66758C" textAnchor="end">최근 진단</text>
      </svg>
    </div>
  );
}
