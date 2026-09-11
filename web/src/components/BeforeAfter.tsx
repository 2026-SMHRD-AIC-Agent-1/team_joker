// 목록의 '보강 전 → 후' 칸. ★ 색은 방향을 따라간다 — 나빠진 진단을 초록으로 칠하지 않는다.
import { direction, fmtPct } from "../lib/format";
import { sev } from "../lib/meta";

export function BeforeAfter({ before, after, comparable }: {
  before: number | null | undefined; after: number | null | undefined; comparable?: number | boolean | null;
}) {
  const d = direction(before, after, comparable);
  if (d === "unknown") return <span className="cell-sub">측정 불가</span>;
  if (d === "incomparable") {
    return <span className="cell-sub num">{fmtPct(before)} → {fmtPct(after)} · 비교 불가</span>;
  }
  const [color, mark] = d === "better" ? [sev("resolved"), "▼"] : d === "worse" ? [sev("unresolved"), "▲"] : ["#5C6C83", "="];
  return (
    <span>
      <span className="num" style={{ color: "#5C6C83" }}>{fmtPct(before)}</span>
      <span className="cell-sub"> → </span>
      <span className="num" style={{ color, fontWeight: 700 }}>{mark} {fmtPct(after)}</span>
    </span>
  );
}
