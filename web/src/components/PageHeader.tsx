import type { ReactNode } from "react";

/** 작업 화면 상단의 제목 줄. 오른쪽 액션 버튼은 children 으로 받는다. */
export function PageHeader({ title, desc, eyebrow, children }:
  { title: string; desc?: ReactNode; eyebrow?: string; children?: ReactNode }) {
  return (
    <>
      <div className="pagehead-row">
        <div className="pagehead">
          {/* ★ 첫 화면(랜딩)만 eyebrow 를 쓰고 작업 화면은 안 써서 '다른 사이트' 처럼 읽혔다(0914). */}
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1 className="h-page">{title}</h1>
          {desc ? <div className="d">{desc}</div> : null}
        </div>
        {children ? <div className="pagehead-actions">{children}</div> : null}
      </div>
      <div className="rule" />
    </>
  );
}

export function Breadcrumb({ parts }: { parts: string[] }) {
  return (
    <div className="bc">
      {parts.map((p, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 ? <span className="bc-sep">/</span> : null}
          <span className={i === parts.length - 1 ? "bc-cur" : ""}>{p}</span>
        </span>
      ))}
    </div>
  );
}
