// 앱의 첫 화면(회원). ★ 수치는 전부 GET /api/runs 가 준 값에서만 나온다.
// Security Score 같은 합성 점수는 만들지 않는다 — 기준을 설명할 수 없는 숫자는 심사에서 무너진다.
// 가장 위에 오는 것은 '지금 조치가 필요한 건수' 다. 총 진단 수가 아니다.
import { Link } from "react-router-dom";
import type { RunList, RunRow } from "../api/types";
import { NetworkError } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { RunTable } from "../components/RunTable";
import { Section } from "../components/Section";
import { FindingsDonut, GradeBars, ModelBars } from "../components/DashCharts";
import { EmptyState, ServerDown, Skeleton } from "../components/States";
import { ToolEvidence } from "../components/ToolEvidence";
import { TrendChart, trendPoints } from "../components/TrendChart";
import { useApi } from "../hooks/useApi";
import { actionRequired, comparableRun, isMock } from "../lib/format";
import { GRADE_COLOR, sev } from "../lib/meta";

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

/** ★ 평균 유출 감소폭도 abs() 를 쓰지 않는다. 악화된 진단이 섞이면 평균이 내려가야 맞다. */
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
    <PageHeader eyebrow="OVERVIEW" title="대시보드" desc="내 챗봇의 검사 결과와 아직 해결할 문제를 한눈에 확인하세요.">
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
        <EmptyState icon="🩺" title="첫 검사 결과를 여기서 확인하세요"
          why={<>챗봇의 역할과 규칙을 넣으면 정보 유출 여부와 수정안을 확인할 수 있습니다. <b>예시로도 시작할 수 있습니다.</b></>}
          action={<Link className="btn btn-primary" to="/diagnose">예시로 첫 진단 시작하기</Link>} />
        {/* ★ 새 계정의 빈 대시보드에서도 근거는 보여야 한다. */}
        <ToolEvidence />
      </>
    );
  }

  const s = dashStats(runs);
  const avg = avgText(s.deltas);
  const openTop = s.need ? [...s.openRuns].sort((a, b) => actionRequired(b) - actionRequired(a)).slice(0, 5) : [];
  const shown = new Set(openTop.map((r) => r.run_id));
  const recent = runs.filter((r) => !shown.has(r.run_id)).slice(0, 5);
  return (
    <>
      {header}
      {/* ★ KPI 카드. '안전한 지시문' 같은 칸은 만들지 않는다 — 우리는 '안전' 을 선언하지 않는다(README §6).
          네 칸 모두 GET /api/runs 의 값에서 바로 나온다. */}
      <div className="kpi-grid">
        {[
          { k: "need", label: "해결이 필요한 문제", value: `${s.need}건`,
            sub: s.need ? `진단 ${s.openRuns.length}건에 남아 있습니다` : "남아 있는 항목이 없습니다",
            color: s.need ? sev("unresolved") : sev("resolved"), icon: "alert" },
          { k: "runs", label: "완료한 진단", value: `${s.real.length}건`, sub: "실제 검사 기준", icon: "doc" },
          { k: "grade", label: "최근 진단 등급", value: s.latest?.grade ?? "—",
            sub: s.latest ? (s.latest.target_model ?? "-") : "등급이 매겨진 실제 진단 없음",
            color: s.latest?.grade ? GRADE_COLOR[s.latest.grade] : undefined, icon: "grade" },
          { k: "delta", label: "평균 유출 감소폭", value: avg.text, color: avg.color,
            sub: s.deltas.length ? `비교 가능한 ${s.deltas.length}건 기준` : "비교 가능한 진단 없음", icon: "trend" },
        ].map((x) => (
          <div className="kpi-card" key={x.k}>
            <span className={`kpi-icon ic-${x.icon}`} aria-hidden="true" />
            <div className="kpi-body">
              <div className="kpi-l">{x.label}</div>
              <div className="kpi-v num" style={x.color ? { color: x.color } : undefined}>{x.value}</div>
              <div className="kpi-s">{x.sub}</div>
            </div>
          </div>
        ))}
      </div>
      {s.incomparableN ? (
        <p className="fine">서로 다른 공격으로 시험한 {s.incomparableN}건은 평균 비교에서 제외했습니다.</p>
      ) : null}
      <div className="checkline">수정 후에도 정보가 노출된 항목을 ‘해결이 필요한 문제’로 표시합니다.</div>
      {s.mockN ? (
        <p className="fine">예시 결과 {s.mockN}건은 실제 검사가 아니므로 통계에서 제외했습니다.</p>
      ) : null}
      {!s.real.length ? (
        <div className="notice" style={{ marginTop: 12 }}>저장된 기록이 모두 <b>예시 결과</b>입니다. 실제 검사를 실행하면 통계가 표시됩니다.</div>
      ) : null}

      {/* ★ 0914: 지표 줄 아래 자리는 '이 계정의 실제 집계' 가 갖는다. 도구의 검증 근거(별도 데이터)는
          아래로 내리고 접었다 — 두 종류의 숫자가 같은 높이에 있으면 어느 쪽이 내 결과인지 헷갈린다. */}
      <div className="chart-grid">
        <FindingsDonut runs={s.real} />
        <GradeBars runs={s.real} />
        <ModelBars runs={s.real} />
      </div>

      {/* ★ 0914: 아래 '최근 진단' 과 같은 행이 두 번 그려지던 문제 — 여기 이미 보인 진단은 아래에서 뺀다.
          이 도구는 대부분의 진단에 조치가 남아 표가 통째로 겹쳤다. */}
      {s.need ? (
        <>
          <Section title="조치가 필요한 진단" desc="수정 후에도 정보가 노출된 진단입니다. 결과를 열어 확인하세요." />
          <div style={{ marginTop: 8 }}><RunTable label="조치가 필요한 진단" runs={openTop} /></div>
        </>
      ) : null}

      {trendPoints(s.real).length >= 3 ? (
        <>
          {/* ★ '개선 추이' 라고 부르지 않는다 — 나빠진 진단이 섞여도 제목이 개선이라고 말하게 된다. */}
          <Section title="수정 전후 정보 유출 비율"
            desc={<>가는 선은 <b>수정 전</b>, 굵은 선은 <b>수정 후</b>입니다. 낮을수록 유출이 적습니다.</>} />
          <div style={{ marginTop: 8 }}><TrendChart runs={s.real} /></div>
        </>
      ) : null}

      {recent.length ? (
        <>
          <Section title={shown.size ? "그 밖의 최근 진단" : "최근 진단"}
            desc={shown.size ? "위 표에 이미 나온 진단은 여기서 뺐습니다." : undefined} />
          <div style={{ marginTop: 8 }}><RunTable label="최근 진단" runs={recent} /></div>
        </>
      ) : null}
      {runs.length > shown.size ? (
        <Link className="btn" style={{ marginTop: 12, minWidth: 220 }} to="/history">전체 {runs.length}건 보기 →</Link>
      ) : null}
      <details className="xp" style={{ marginTop: 24 }}>
        <summary>이 도구의 검증 근거 — 별도 데이터로 측정한 값</summary>
        <div className="xp-body"><ToolEvidence heading={false} /></div>
      </details>
    </>
  );
}
