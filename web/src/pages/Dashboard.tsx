// 앱의 첫 화면(회원). ★ 수치는 전부 GET /api/runs 가 준 값에서만 나온다.
// Security Score 같은 합성 점수는 만들지 않는다 — 기준을 설명할 수 없는 숫자는 심사에서 무너진다.
// 가장 위에 오는 것은 '지금 조치가 필요한 건수' 다. 총 진단 수가 아니다.
import { Link } from "react-router-dom";
import type { RunList, RunRow } from "../api/types";
import { NetworkError } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { RunTable } from "../components/RunTable";
import { Section } from "../components/Section";
import { StatRow } from "../components/StatRow";
import { EmptyState, ServerDown, Skeleton } from "../components/States";
import { ToolEvidence } from "../components/ToolEvidence";
import { TrendChart, trendPoints } from "../components/TrendChart";
import { useApi } from "../hooks/useApi";
import { actionRequired, comparableRun, isMock } from "../lib/format";
import { sev } from "../lib/meta";

export interface DashStats {
  real: RunRow[]; mockN: number; need: number; openRuns: RunRow[];
  deltas: number[]; incomparableN: number; latest: RunRow | undefined;
}

export function dashStats(runs: RunRow[]): DashStats {
  // ★ mock(가짜 응답) 런은 집계에서 뺀다. 항상 100%→0%·등급 A 라서 섞이면 지표가 좋아 보인다.
  const real = runs.filter((r) => !isMock(r) && r.status !== "running" && r.status !== "error");
  const openRuns = real.filter((r) => actionRequired(r) > 0);
  // ★ 비교 불가 진단은 평균에서 뺀다 — 다른 공격 집합의 두 수의 뺄셈은 개선폭이 아니다.
  const deltas = real
    .filter((r) => typeof r.asr_before === "number" && typeof r.asr_after === "number" && comparableRun(r))
    .map((r) => (r.asr_before as number) - (r.asr_after as number));
  return {
    real, mockN: runs.filter(isMock).length,
    need: real.reduce((s, r) => s + actionRequired(r), 0), openRuns, deltas,
    incomparableN: real.filter((r) => r.comparable === 0 || r.comparable === false).length,
    // ★ '최근 등급' 은 실제 진단 중 등급이 매겨진 최신 건. mock 으로 폴백하지 않는다.
    latest: real.find((r) => r.grade),
  };
}

/** ★ 평균 변화량도 abs() 를 쓰지 않는다. 악화된 진단이 섞이면 평균이 내려가야 맞다. */
export function avgText(deltas: number[]): { text: string; color?: string } {
  if (!deltas.length) return { text: "-" };
  const avg = (deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100;
  if (avg > 0.05) return { text: `▼ ${Math.round(avg)}%p`, color: sev("resolved") };
  if (avg < -0.05) return { text: `▲ ${Math.round(Math.abs(avg))}%p`, color: sev("unresolved") };
  return { text: "변화 없음" };
}

export function Dashboard() {
  const { data, error, loading, reload } = useApi<RunList>("/api/runs");
  const header = (
    <PageHeader title="대시보드" desc="이 계정으로 실행한 진단의 현황입니다.">
      <button className="btn" disabled={loading} onClick={reload}>새로고침</button>
      <Link className="btn btn-primary" to="/diagnose">＋ 새 진단</Link>
    </PageHeader>
  );
  if (error) return <>{header}{error instanceof NetworkError ? <ServerDown /> : <ServerDown />}</>;
  if (loading && !data) return <>{header}<Skeleton rows={4} height={48} /></>;
  const runs = data?.runs ?? [];

  if (!runs.length) {
    return (
      <>
        {header}
        <EmptyState icon="🩺" title="아직 진단한 지시문이 없습니다"
          why={<>챗봇에 넣은 시스템 지시문을 붙여넣으면 한국어 공격을 실제로 던져 뚫리는 지점을 찾고, 방어 문구로 지시문을
            보강한 뒤, 같은 공격을 다시 던져 개선을 숫자로 보여줍니다. 무엇을 넣을지 모르겠다면 <b>예시 지시문</b>으로 바로
            시작할 수 있습니다.</>}
          action={<Link className="btn btn-primary" to="/diagnose">예시로 첫 진단 시작하기</Link>} />
        {/* ★ 새 계정의 빈 대시보드에서도 근거는 보여야 한다. */}
        <ToolEvidence />
      </>
    );
  }

  const s = dashStats(runs);
  const avg = avgText(s.deltas);
  return (
    <>
      {header}
      <StatRow items={[
        { label: "조치가 필요한 발견 항목", value: `${s.need}건`,
          sub: s.need ? `진단 ${s.openRuns.length}건에 남아 있습니다` : "남아 있는 항목이 없습니다",
          color: s.need ? sev("unresolved") : sev("resolved") },
        { label: "진단한 지시문", value: `${s.real.length}건`, sub: "누적 (mock 제외)" },
        { label: "최근 진단 등급", value: s.latest?.grade ?? "—",
          sub: s.latest ? (s.latest.target_model ?? "-") : "등급이 매겨진 실제 진단 없음" },
        { label: "평균 변화량", value: avg.text, color: avg.color,
          sub: s.deltas.length ? `비교 가능한 ${s.deltas.length}건 기준` : "비교 가능한 진단 없음" },
      ]} />
      {s.incomparableN ? (
        <p className="fine">※ 보강 전·후가 서로 다른 공격 집합으로 실행된 진단 {s.incomparableN}건은 ‘평균 변화량’ 에서 제외했습니다(비교 불가).</p>
      ) : null}
      <div className="checkline">‘조치가 필요한 발견 항목’ = <b>미해결</b> + <b>보강 후 신규</b>. 결과 화면의 상태 스트립과 같은 기준입니다.</div>
      {s.mockN ? (
        <p className="fine">※ mock(가짜 응답) 런 {s.mockN}건은 위 집계와 추이에서 제외했습니다 — 항상 100%→0% 라 섞이면 지표가 실제보다 좋아 보입니다. 목록에는 표시됩니다.</p>
      ) : null}
      {!s.real.length ? (
        <div className="notice" style={{ marginTop: 12 }}>지금 저장된 진단이 모두 <b>mock(가짜 응답)</b> 이라 위 지표에 집계할 실제 결과가 없습니다.
          실제 모델로 한 번 진단하면 여기에 값이 채워집니다.</div>
      ) : null}

      {/* ★ 지표 줄 바로 아래 — 시연 첫 화면에서 스크롤 없이 보인다(0911 결정). */}
      <ToolEvidence />

      {s.need ? (
        <>
          <Section title="조치가 필요한 진단" desc="미해결이거나 보강 후 새로 뚫린 항목이 남아 있는 진단입니다 — JOKER-KO 탐지기 배치 대상입니다." />
          <div style={{ marginTop: 8 }}>
            <RunTable label="조치가 필요한 진단" runs={[...s.openRuns].sort((a, b) => actionRequired(b) - actionRequired(a)).slice(0, 5)} />
          </div>
        </>
      ) : null}

      {trendPoints(s.real).length >= 3 ? (
        <>
          {/* ★ '개선 추이' 라고 부르지 않는다 — 나빠진 진단이 섞여도 제목이 개선이라고 말하게 된다. */}
          <Section title="보강 전·후 공격 성공률 추이"
            desc={<>가는 선이 <b>보강 전</b>, 굵은 선이 <b>보강 후</b>입니다. 굵은 선이 아래로 갈수록 좋습니다. mock 런과 비교 불가 진단은 빠져 있습니다.</>} />
          <div style={{ marginTop: 8 }}><TrendChart runs={s.real} /></div>
        </>
      ) : null}

      <Section title="최근 진단" />
      <div style={{ marginTop: 8 }}><RunTable label="최근 진단" runs={runs.slice(0, 5)} /></div>
      {runs.length > 5 ? (
        <Link className="btn" style={{ marginTop: 12, minWidth: 220 }} to="/history">전체 {runs.length}건 보기 →</Link>
      ) : null}
    </>
  );
}
