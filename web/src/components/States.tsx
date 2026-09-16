// 빈 상태 · 실패 · 서버 연결 끊김. ★ 실패는 '무엇이 / 왜 / 지금 뭘 하면 되나' 를 전부 말한다.
// ★ 예외 원문을 화면에 싣지 않는다(내부 주소가 섞여 온다). 문구는 여기 고정한다.
import type { ReactNode } from "react";
import { FINDING_META } from "../lib/meta";

export function EmptyState({ icon, title, why, action }: {
  icon: string; title: string; why: ReactNode; action?: ReactNode;
}) {
  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "40px 24px", background: "var(--soft)" }}>
        <div style={{ fontSize: "1.5rem" }} aria-hidden>{icon}</div>
        <div style={{ fontWeight: 750, color: "var(--ink)", fontSize: "1.02rem", margin: "10px 0 6px" }}>{title}</div>
        <div style={{ color: "var(--muted)", fontSize: ".88rem", lineHeight: 1.75, maxWidth: "34rem", margin: "0 auto" }}>{why}</div>
      </div>
      {action ? <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>{action}</div> : null}
    </>
  );
}

export function Failure({ icon, title, why, actions, code, runId, tone = "error" }: {
  icon: string; title: string; why: ReactNode; actions: ReactNode[];
  code?: string; runId?: string | null; tone?: "error" | "warn";
}) {
  const color = tone === "warn" ? FINDING_META.unjudged.color : FINDING_META.unresolved.color;
  const meta = [code ? `code ${code}` : "", runId ? `run ${runId}` : ""].filter(Boolean).join(" · ");
  return (
    <div className="card" role="alert" style={{ borderColor: `${color}33`, background: `${color}0A` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: "1.15rem" }} aria-hidden>{icon}</div>
        <div style={{ fontWeight: 750, color, fontSize: "1rem" }}>{title}</div>
      </div>
      <div style={{ color: "var(--ink2)", fontSize: ".9rem", lineHeight: 1.7 }}>{why}</div>
      <div style={{ marginTop: 14, fontWeight: 700, color: "var(--ink)", fontSize: ".86rem" }}>지금 할 수 있는 것</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--ink2)", fontSize: ".88rem", lineHeight: 1.7 }}>
        {actions.map((a, i) => <li key={i} style={{ margin: "4px 0" }}>{a}</li>)}
      </ul>
      {meta ? <div className="mono" style={{ marginTop: 12, fontSize: ".75rem", color: "var(--muted2)" }}>{meta}</div> : null}
    </div>
  );
}

export function ServerDown({ runId }: { runId?: string | null }) {
  return (
    <Failure icon="📡" title="진단 서버와 연결이 끊겼습니다" runId={runId}
      why={<>결과를 불러올 수 없습니다. <b>연결이 끊겨도 서버가 작동 중이면 진단은 계속됩니다.</b></>}
      actions={[
        "인터넷 연결을 확인한 뒤 새로고침",
        <>로그인한 경우 연결 복구 후 <b>진단 기록</b>에서 결과 확인</>,
      ]} />
  );
}

export function Skeleton({ rows = 3, height = 34 }: { rows?: number; height?: number }) {
  return (
    <div className="sk-wrap" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk" style={{ height }} />)}
    </div>
  );
}
