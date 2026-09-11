// 진단 목록(전체). 메뉴에는 없고 대시보드 '전체 N건 보기' 로 들어온다(0911 D).
// ★ 서버가 소유자 범위로 잘라서 준다. 화면에서 거르지 않는다 — 응답에 실려 있으면 개발자도구로 보인다.
import { Link, useLocation } from "react-router-dom";
import type { RunList } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { RunTable } from "../components/RunTable";
import { EmptyState, ServerDown, Skeleton } from "../components/States";
import { useApi } from "../hooks/useApi";
import { isMock } from "../lib/format";

export function History() {
  const { data, error, loading } = useApi<RunList>("/api/runs");
  // 리포트에서 삭제하고 넘어온 경우 — 무엇이 지워졌는지 한 줄로 알린다.
  const deleted = (useLocation().state as { deleted?: string } | null)?.deleted;
  const notice = deleted ? <div className="notice" role="status" style={{ marginBottom: 12 }}>진단을 삭제했습니다 · <span className="mono">{deleted}</span></div> : null;
  const header = (
    <PageHeader title="진단 목록" desc="이 계정으로 저장된 진단입니다. 행을 열면 리포트로 이동합니다.">
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
  return (
    <>
      {header}
      {notice}
      {mockN ? <div className="alert alert-warn">⚠️ mock(가짜 응답) 런이 {mockN}건 섞여 있습니다 — 등급·ASR 을 인용하지 마세요.</div> : null}
      <RunTable label="진단 목록" runs={runs.slice(0, 30)} />
      {runs.length > 30 ? <p className="fine">최근 30건만 표시합니다 (전체 {runs.length}건).</p> : null}
    </>
  );
}
