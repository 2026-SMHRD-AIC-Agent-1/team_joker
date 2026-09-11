import type { ReactNode } from "react";

export function Section({ title, desc }: { title: string; desc?: ReactNode }) {
  return (
    <>
      <div className="h-sec">{title}</div>
      {desc ? <div className="t-desc">{desc}</div> : null}
    </>
  );
}

export function SubSection({ title }: { title: string }) {
  return <div className="h-sub">{title}</div>;
}
