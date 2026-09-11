import type { CSSProperties, ReactNode } from "react";

export interface StatItem { label: string; value: ReactNode; sub: string; color?: string }

/** 지표 줄. 대시보드·리포트 공용. */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    // ★ 열 수를 인라인 grid-template-columns 로 주면 좁은 화면용 미디어 쿼리가 못 이긴다(768px 에서 4열이 남음).
    //   CSS 변수로만 넘기고, 실제 열 규칙은 app.css 가 정한다.
    <div className="stat" style={{ ["--cols" as string]: items.length } as CSSProperties}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="l">{it.label}</div>
          <div className="v" style={it.color ? { color: it.color } : undefined}>{it.value}</div>
          <div className="s">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
