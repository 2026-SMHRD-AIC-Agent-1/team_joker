// 진단 목록(전체). 메뉴에는 없고 대시보드 '전체 N건 보기' 로 들어온다(0911 D).
// ★ 서버가 소유자 범위로 잘라서 준다. 화면에서 거르지 않는다 — 응답에 실려 있으면 개발자도구로 보인다.
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { actionRequired } from "../lib/format";
import type { RunList } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { RunTable } from "../components/RunTable";
import { EmptyState, ServerDown, Skeleton } from "../components/States";
import { useApi } from "../hooks/useApi";
import { isMock } from "../lib/format";

export function History() {
  const { data, error, loading, reload } = useApi<RunList>("/api/runs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  // 리포트에서 삭제하고 넘어온 경우 — 무엇이 지워졌는지 한 줄로 알린다.
  const deleted = (useLocation().state as { deleted?: string } | null)?.deleted;
  const notice = deleted ? <div className="notice" role="status" style={{ marginBottom: 12 }}>진단을 삭제했습니다 · <span className="mono">{deleted}</span></div> : null;
  const header = (
    <PageHeader title="진단 목록" desc="이 계정으로 저장된 진단입니다. 행을 열면 리포트로 이동합니다.">
      <button className="btn" disabled={loading} onClick={reload}>새로고침</button>
      <Link className="btn btn-primary" to="/diagnose">＋ 새 진단</Link>
    </PageHeader>
  );
  if (error) return <>{header}{notice}<ServerDown /></>;
  if (loading && !data) return <>{header}<Skeleton rows={6} /></>;
  const runs = data?.runs ?? [];
  if (!runs.length) {
    return <>{header}{notice}<EmptyState icon="🗂" title="저장된 진단이 없습니다"
      why="진단을 한 번 실행하면 여기에 쌓입니다. 같은 지시문을 고쳐가며 여러 번 진단해 변화량을 비교해 보세요."
      action={<Link className="btn btn-primary" to="/diagnose">새 진단 시작하기</Link>} /></>;
  }
  const mockN = runs.filter(isMock).length;
  const filtered = runs.filter(r => {
    const matches = `${r.run_id} ${r.persona ?? ""} ${r.target_model ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter === "all" || (filter === "action" ? actionRequired(r) > 0 : filter === "mock" ? isMock(r) : filter === "inconclusive" ? Boolean(r.inconclusive) : r.status === filter));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const current = Math.min(page, pages - 1);
  return (
    <>
      {header}
      {notice}
      {mockN ? <div className="alert alert-warn">⚠️ mock(가짜 응답) 런이 {mockN}건 섞여 있습니다 — 등급·ASR 을 인용하지 마세요.</div> : null}
      <div className="adv-grid" style={{ marginBottom: 16 }}>
        <div className="field"><label htmlFor="history-search">진단 검색</label><input id="history-search" className="input" value={search} placeholder="진단 ID · 페르소나 · 모델" onChange={e => { setSearch(e.target.value); setPage(0); }} /></div>
        <div className="field"><label htmlFor="history-filter">표시할 진단</label><select id="history-filter" className="select" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>
          <option value="all">전체</option><option value="action">조치 필요</option><option value="running">진행 중</option><option value="error">실패</option><option value="inconclusive">진단 불가</option><option value="mock">Mock</option>
        </select></div>
      </div>
      {filtered.length ? <RunTable label="진단 목록" runs={filtered.slice(current * 30, (current + 1) * 30)} /> : <p role="status">조건에 맞는 진단이 없습니다.</p>}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn" disabled={current === 0} onClick={() => setPage(current - 1)}>이전</button>
        <span role="status">{current + 1} / {pages} 페이지 · {filtered.length}건 (전체 {runs.length}건)</span>
        <button className="btn" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>다음</button>
      </div>
    </>
  );
}
