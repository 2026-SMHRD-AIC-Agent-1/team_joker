// 03 · 공격 기록 — 발견 항목 목록(필터 · 검색). 리포트 덤프가 아니라 '다룰 수 있는 항목' 으로 만든다.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { FindingState, Gated, Report } from "../../api/types";
import {
  buildFindings, currentChannel, defaultStates, filterFindings, FINDING_ORDER, reportActionRequired, VERDICT_BY_KO,
} from "../../lib/findings";
import type { Finding, FindingFilter } from "../../lib/findings";
import { FINDING_META } from "../../lib/meta";
import { Section } from "../Section";
import { EmptyState } from "../States";
import { Gate } from "./Gate";

// 상세 화면에 갔다 돌아와도 필터가 그대로 있게 진단별로 기억한다(메모리만 — 새로고침하면 기본값).
const filterCache = new Map<string, FindingFilter>();

export function StateBadge({ state }: { state: FindingState }) {
  const { name, color } = FINDING_META[state];
  return <span className="badge" style={{ color }}><i style={{ background: color }} />{name}</span>;
}

/** 상세 화면의 이전/다음 순서. 목록과 같은 필터·정렬을 따라야 길을 잃지 않는다. */
export function findingOrder(runId: string, findings: Finding[]): string[] {
  const f = filterCache.get(runId) ?? { states: defaultStates(findings), techs: [], q: "" };
  const rows = filterFindings(findings, f);
  return rows.length ? rows.map((x) => x.id) : filterFindings(findings, { states: [...FINDING_ORDER], techs: [], q: "" }).map((x) => x.id);
}

export function Findings({ runId, rep, gated, onSignup }: { runId: string; rep: Report; gated: Gated; onSignup: () => void }) {
  const findings = useMemo(() => buildFindings(rep.attempts), [rep.attempts]);
  const [filter, setFilterState] = useState<FindingFilter>(
    () => filterCache.get(runId) ?? { states: defaultStates(findings), techs: [], q: "" });
  const setFilter = (f: FindingFilter) => { filterCache.set(runId, f); setFilterState(f); };

  const header = (
    <Section title="발견 항목"
      desc={<>공격 1건이 발견 항목 1건입니다. 처음에는 <b>지금 조치·재검증이 필요한 상태</b>만 켜 둡니다 — 상태 필터를 모두 켜면 전체 항목으로 돌아갑니다.</>} />
  );

  if (gated.is_gated && (gated.attempts_hidden ?? 0)) {
    // ★ 건수(위험 사실)는 위에 다 보인다. 여기서 가리는 것은 그 '증거' 뿐이다.
    const need = reportActionRequired(rep);
    const n = `${rep.findings_summary.total}건`;
    return (
      <>
        {header}
        <Gate title={need ? `공격별 상세 증거 — 조치가 필요한 ${need}건의 공격 문구와 판정 근거`
          : `공격별 상세 증거 — 던진 공격 ${n} 전부의 문구와 판정 근거`}
          total={n} hidden={n} unlock={gated.unlock} decoy="attempts" onSignup={onSignup} />
      </>
    );
  }
  if (!findings.length) {
    return <>{header}<EmptyState icon="📄" title="표시할 발견 항목이 없습니다" why="이 진단에는 공격 시도 기록이 없습니다. 새로 진단하면 다시 채워집니다." /></>;
  }

  const techs = [...new Set(findings.map((f) => f.techniqueKo).filter(Boolean))].sort();
  const rows = filterFindings(findings, filter);
  const on = FINDING_ORDER.filter((k) => (filter.states.length ? filter.states : FINDING_ORDER).includes(k));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const count = (s: FindingState) => findings.filter((f) => f.state === s).length;

  return (
    <>
      {header}
      <div className="filters" role="group" aria-label="발견 항목 필터">
        <div className="chips">
          {FINDING_ORDER.map((s) => (
            <button type="button" key={s} className="chip" aria-pressed={filter.states.includes(s)}
              onClick={() => setFilter({ ...filter, states: toggle(filter.states, s) })}>
              <i style={{ background: FINDING_META[s].color }} />{FINDING_META[s].name} <span className="num">{count(s)}</span>
            </button>
          ))}
        </div>
        {techs.length > 1 ? (
          <div className="chips">
            {techs.map((t) => (
              <button type="button" key={t} className="chip chip-sm" aria-pressed={filter.techs.includes(t)}
                onClick={() => setFilter({ ...filter, techs: toggle(filter.techs, t) })}>{t}</button>
            ))}
          </div>
        ) : null}
        <div className="filter-row">
          <input className="input" type="search" aria-label="검색" placeholder="공격 ID · 기법명 · 공격 문구로 검색"
            value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <button type="button" className="btn" onClick={() => setFilter({ states: defaultStates(findings), techs: [], q: "" })}>필터 초기화</button>
        </div>
      </div>
      {/* 현재 적용된 필터를 문장으로 — '왜 3건만 보이지?' 에 화면이 먼저 답한다. */}
      <div className="checkline" data-testid="filterline">
        적용된 필터 — 상태 {on.length === FINDING_ORDER.length ? "전체" : on.map((k) => FINDING_META[k].name).join(" · ")}
        {filter.techs.length ? ` / 기법 ${[...filter.techs].sort().join(" · ")}` : ""}
        {filter.q.trim() ? ` / 검색 “${filter.q.trim()}”` : ""} · <b>{rows.length}건</b> 표시 (전체 발견 항목 {findings.length}건).
        이 숫자는 필터 결과이며, 위 요약의 건수와 다를 수 있습니다.
      </div>
      {!rows.length ? (
        <div className="notice">이 조건에 해당하는 발견 항목이 없습니다. 상태 필터를 더 켜거나 검색어를 지운 뒤 다시 보세요 —{" "}
          <b>필터 초기화</b> 를 누르면 기본 조건으로 돌아갑니다.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl" aria-label="발견 항목">
            <thead><tr><th>상태</th><th>공격 ID</th><th>기법</th><th>유출 채널</th><th>판정 근거</th><th /></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td><StateBadge state={f.state} /></td>
                  <td className="mono">{f.id}</td>
                  <td style={{ fontSize: ".85rem" }}>{f.techniqueKo}</td>
                  <td className="cell-sub">{currentChannel(f)}</td>
                  <td className="cell-sub">{f.verdictBy ? (VERDICT_BY_KO[f.verdictBy] ?? "—") : "—"}</td>
                  <td className="act"><Link to={`/runs/${encodeURIComponent(runId)}/f/${encodeURIComponent(f.id)}`}>상세 →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
