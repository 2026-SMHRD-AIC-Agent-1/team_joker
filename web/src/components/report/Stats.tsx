// 03 · 통계 · 측정 조건. 등급 · 변화량 · 기법별 막대 · 재현 조건.
import type { Report, Run } from "../../api/types";
import { deltaView, techBar } from "../../lib/delta";
import { GRADE_COLOR } from "../../lib/meta";
import { Section } from "../Section";

export function TechniqueBars({ rows }: { rows: Report["by_technique"] }) {
  return (
    <div className="tb" data-testid="tech-bars">
      <div className="tb-head"><div>공격 기법</div><div>보강 전</div><div /><div /><div>보강 후</div><div /></div>
      {rows.map((r) => {
        const b = techBar(r);
        if (b.kind === "na") return <div className="notice" key={r.technique}>{b.name} · 판정 불가 / 미측정</div>;
        return (
          <div className="tb-row" key={r.technique}>
            <div className="tb-name" title={b.name}>{b.name}</div>
            <div className="tb-track"><div className="tb-bar tb-before" style={{ width: `${b.before.toFixed(0)}%` }} /></div>
            <div className="tb-val tb-vb num">{b.before.toFixed(0)}%</div>
            <div className="tb-arrow">→</div>
            <div className="tb-track"><div className={`tb-bar ${b.cls}`} style={{ width: `${b.after.toFixed(0)}%` }} /></div>
            <div className={`tb-val ${b.cls}-t num`}>{b.mark} {b.after.toFixed(0)}%</div>
          </div>
        );
      })}
    </div>
  );
}

/** 측정 조건 — run_id · temperature · seed 는 '알아야 하는 사람만 볼 값' 이라 여기 모은다. */
export function Conditions({ run }: { run: Run }) {
  const t = run.target;
  const rows: [string, string][] = [
    ["진단 식별자", run.run_id || "-"],
    ["진단 대상 모델", t.model || "-"],
    ["백엔드", t.backend || "-"],
    ["프리셋", t.preset || "-"],
    ["temperature", t.temperature === undefined ? "-" : String(t.temperature)],
    ["seed", t.seed === undefined ? "-" : String(t.seed)],
    ["모델 충실도", t.fidelity === "proxy_model" ? "대리 모델" : "실제 모델 (BYOK)"],
    ["실행 시각", run.created_at || "-"],
  ];
  return (
    <>
      <Section title="측정 조건과 근거" desc="재시험 조건을 남깁니다. 모델·서버 특성에 따라 같은 조건에서도 응답은 달라질 수 있습니다." />
      <div className="meta">
        {rows.map(([k, v]) => <div className="row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
      </div>
      <p className="fine">진단 범위 — {t.scope_notice}</p>
    </>
  );
}

export function Stats({ run, rep }: { run: Run; rep: Report }) {
  const d = deltaView(rep);
  const color = d.tone === "down" ? GRADE_COLOR.A : d.tone === "up" ? GRADE_COLOR.F : "var(--muted)";
  return (
    <>
      <div className="meta" style={{ marginBottom: 12 }}>
        <div className="row"><span className="k">보강안 재시험 등급</span>
          <span className="v" style={rep.grade ? { color: GRADE_COLOR[rep.grade] } : undefined}>{rep.grade ?? "판정 보류"}</span></div>
        <div className="row"><span className="k">공격 성공률 변화</span>
          <span className="v num" style={{ color }} data-testid="delta">{d.value}</span></div>
      </div>
      <p className="fine">{d.worse ? <b>{d.why}</b> : d.why}{rep.grade_basis ? ` 등급 근거 — ${rep.grade_basis}.` : ""}</p>
      {rep.comparable === false ? (
        <div className="alert alert-warn">서로 다른 공격 집합으로 실행되어 전후 비교를 보류합니다.</div>
      ) : null}
      {rep.by_technique?.length ? <TechniqueBars rows={rep.by_technique} /> : null}
      <Conditions run={run} />
    </>
  );
}
