// 진단 한 건 — 진행 / 결과 / 진단 불가 / 실패 네 상태를 한 라우트가 맡는다(/runs/:runId, /runs/:runId/f/:fid).
//
// ★ 서버가 소유자·게이팅을 판단한다. 이 화면은 받은 것만 그린다 — 비회원 응답에는 증거 상세가 애초에 없다.
// ★ 남의 진단·없는 진단은 서버가 둘 다 404 로 답한다(IDOR). 화면도 둘을 구분하지 않는다.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/client";
import type { Run } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { getStart } from "../auth/session";
import { AuthDialog } from "../components/AuthDialog";
import { Dialog } from "../components/Dialog";
import { Breadcrumb, PageHeader } from "../components/PageHeader";
import { Section } from "../components/Section";
import { EmptyState, Failure, ServerDown, Skeleton } from "../components/States";
import { EvidenceDialog } from "../components/ToolEvidence";
import { EvidenceCards } from "../components/report/Evidence";
import { FindingDetail } from "../components/report/FindingDetail";
import { Findings } from "../components/report/Findings";
import { Hero } from "../components/report/Hero";
import { DetectorCta, FilterAction, LayerRelation } from "../components/report/Layers";
import { Inconclusive, RunError } from "../components/report/Outcomes";
import { Prescription } from "../components/report/Prescription";
import { ProgressView } from "../components/report/Progress";
import { Stats } from "../components/report/Stats";
import { SCOPE_NOTICE } from "../lib/advice";

const POLL_MS = 3000;

function ScopeNote({ run }: { run: Run }) {
  // ★ 문장을 지우지 않고 읽는 순서만 바꾼다. 히어로 lead 한 줄이 보이는 경로에 남아 있고, 나머지는 여기 모은다.
  const lines = [
    <><b>보강안은 아직 운영 서비스에 적용되지 않았습니다.</b> 아래에서 실제 증거와 적용할 내용을 확인할 수 있습니다.</>,
    SCOPE_NOTICE,
    run.target.model_notice ?? null,
    run.privacy_notice ?? null,
  ].filter(Boolean);
  return (
    <details className="xp">
      <summary>이 결과의 범위와 한계</summary>
      <div className="xp-body report-meta">{lines.map((l, i) => <div key={i}>· {l}</div>)}</div>
    </details>
  );
}

function ReportBody({ run, onSignup, focusFindings }: { run: Run; onSignup: () => void; focusFindings: boolean }) {
  const rep = run.report!;
  const gated = run.gated ?? { is_gated: false };
  const residual = rep.filter_recommendation?.residual ?? 0;
  const step = rep.filter_recommendation?.note ? 2 : 1;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [tab, setTab] = useState<"log" | "stat">("log");
  useEffect(() => {
    if (focusFindings && detailsRef.current) {
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ block: "start" });
    }
  }, [focusFindings]);
  return (
    <>
      <Hero rep={rep} assetsN={run.recon?.assets ? run.recon.assets.length : null} />
      <ScopeNote run={run} />
      <EvidenceCards rep={rep} gated={gated} onSignup={onSignup} />

      <Section title="02 · 권고 조치" desc="문구 보강만으로 끝내지 않고, 적용 후 정상 업무까지 확인하세요." />
      {/* 관계도를 권고 맨 위에 — 아래 1번 권고가 왜 나왔는지를 그림으로 먼저 보인다. */}
      <LayerRelation residual={residual} />
      <FilterAction rep={rep} index={1} />
      <DetectorCta rep={rep} />
      {/* ★ 0911 D: 권고는 이 진단이 만든 것만. 비밀값을 지시문 안에서 실제로 찾아냈으므로 근본 조치를 남긴다. */}
      <div className="next-action"><span className="step">{step}</span>
        <div><b>비밀값을 지시문 밖으로 옮기세요</b><p>실제 비밀번호와 접근키는 서버에서 보관하고 인증·권한 검사로 접근을 제어하세요.</p></div></div>
      {rep.findings_summary.regressed ? (
        <div className="alert alert-warn">보강 후 새로 유출된 요청이 있습니다. 적용 전에 이 항목의 재검증이 필요합니다.</div>
      ) : null}
      <details className="xp">
        <summary>보강안과 변경 내용 확인</summary>
        <div className="xp-body"><Prescription rep={rep} gated={gated} onSignup={onSignup} /></div>
      </details>

      <Section title="03 · 더 자세히 확인하기" />
      {/* ★ 0911 D: 접기 두 개를 하나로(탭 2개) — 둘 다 '더 자세히' 라서. */}
      <details className="xp" ref={detailsRef} id="findings">
        <summary>전체 공격 기록 확인</summary>
        <div className="xp-body">
          <div className="tabs" role="tablist">
            <button type="button" className="tab" role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>공격 기록</button>
            <button type="button" className="tab" role="tab" aria-selected={tab === "stat"} onClick={() => setTab("stat")}>통계 · 측정 조건</button>
          </div>
          {tab === "log" ? <Findings runId={run.run_id} rep={rep} gated={gated} onSignup={onSignup} /> : <Stats run={run} rep={rep} />}
        </div>
      </details>
    </>
  );
}

function DeleteButton({ runId }: { runId: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = useCallback(() => { setOpen(false); setErr(null); }, []);
  const del = async () => {
    setBusy(true);
    try {
      await api.del(`/api/runs/${encodeURIComponent(runId)}`);
      nav("/history", { state: { deleted: runId } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "진단 서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>삭제</button>
      <Dialog title="이 진단을 삭제할까요?" open={open} onClose={close}>
        <p>이 진단과 공격 로그·자산·패턴이 함께 <b>영구 삭제</b>됩니다. 되돌릴 수 없습니다.</p>
        <p className="mono fine">{runId}</p>
        {err ? <div className="form-error" role="alert">{err}</div> : null}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={close}>취소</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={del}>{busy ? "삭제하는 중…" : "영구 삭제"}</button>
        </div>
      </Dialog>
    </>
  );
}

export function RunPage() {
  const { runId = "", fid } = useParams();
  const location = useLocation();
  const { token, loggedIn } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // 로그인·가입(claim) 직후에는 같은 진단을 다시 받아 전체 리포트로 바꾼다 — token 이 바뀌면 다시 부른다.
  useEffect(() => {
    let alive = true;
    setError(null);
    api.get<Run>(`/api/runs/${encodeURIComponent(runId)}`)
      .then((r) => { if (alive) { setRun(r); setError(null); } })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [runId, token, tick]);

  // 진행 중이면 3초마다 다시 묻는다. 끝나면 멈춘다.
  const running = run?.status === "running" && run.run_id === runId;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setTick((x) => x + 1), POLL_MS);
    return () => clearTimeout(t);
  }, [running, run, tick]);

  // 상세 화면으로 오갈 때 위에서부터 보이게.
  useEffect(() => { if (fid) window.scrollTo(0, 0); }, [fid]);

  const newRun = <Link className="btn" to="/diagnose">＋ 새 진단</Link>;

  if (error && !(running && error instanceof NetworkError)) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <>
          <PageHeader title="진단을 찾을 수 없습니다" />
          <EmptyState icon="🔎" title="이 진단을 열 수 없습니다"
            why={<>없는 진단이거나, 다른 계정·다른 방문자의 진단입니다. 두 경우를 구분해 알려 드리지 않습니다 — 진단 ID 만으로
              남의 진단이 있는지 알아낼 수 없게 하기 위해서입니다.{!loggedIn ? " 비회원 진단은 그 진단을 시작한 브라우저 탭에서만 열립니다." : ""}</>}
            action={<>{loggedIn ? <Link className="btn" to="/history" style={{ marginRight: 8 }}>진단 목록</Link> : null}{newRun}</>} />
        </>
      );
    }
    return (
      <>
        <PageHeader title="진단 리포트" />
        {error instanceof ApiError ? (
          <Failure icon="⚠️" title="진단을 불러오지 못했습니다" why={error.message} code={error.code} runId={runId}
            actions={["잠시 뒤 새로고침", "반복되면 API 서버 터미널의 로그 확인"]} />
        ) : <ServerDown runId={runId} />}
        <div className="btn-row" style={{ marginTop: 12 }}><button className="btn" onClick={() => setTick(x => x + 1)}>다시 불러오기</button>{newRun}</div>
      </>
    );
  }
  if (!run || run.run_id !== runId) return <><PageHeader title="진단 리포트" /><Skeleton rows={5} height={48} /></>;

  if (run.status === "running") {
    const start = getStart(runId);
    return (
      <>
        <Breadcrumb parts={["새 진단", "진행 중"]} />
        <PageHeader title="진단 진행 중"
          desc="지시문 분석 → 공격 진단 → 방어 문구 생성 → 재진단 → 결과 정리 순으로 돕니다. 이 화면을 떠나도 진단은 서버에서 계속됩니다." />
        {error ? <ServerDown runId={runId} /> : null}
        <ProgressView progress={run.progress ?? {}} estimatedCalls={run.estimated_calls}
          startedAt={start?.at ?? null} mode={start?.mode ?? null} />
        <p className="fine">취소 기능은 제공하지 않습니다 — 서버에 취소 API 가 없어서, 누르면 멈춘 것처럼 보이지만 실제로는 계속 도는 버튼이 되기 때문입니다.</p>
      </>
    );
  }
  if (run.status === "error") {
    // ★ 실패한 진단에 '진단 리포트' 머리를 씌우지 않는다 — 리포트가 있는 것처럼 읽힌다.
    return (
      <>
        <Breadcrumb parts={["새 진단", "실패"]} />
        <PageHeader title="진단이 끝나지 못했습니다" desc="아래에 원인과 다음에 할 일이 있습니다." />
        <RunError run={run} />
        <div style={{ marginTop: 12 }}><Link className="btn btn-primary" to="/diagnose">＋ 새 진단</Link></div>
      </>
    );
  }

  const t = run.target;
  const header = (
    <>
      <Breadcrumb parts={[loggedIn ? "진단 목록" : "진단 결과", run.run_id, ...(fid ? [fid] : [])]} />
      <PageHeader title="진단 리포트" desc={<>
        <code>{t.model}</code> · {t.backend} · <span className="pill">{t.fidelity === "proxy_model" ? "대리 모델" : "실제 모델 (BYOK)"}</span>
        <span className="pill pill-b">{run.status === "inconclusive" ? "진단 불가" : "완료"}</span></>}>
        {newRun}
        {/* 이 도구 자체의 검증 수치로 가는 길. 공개 수치라 비회원에게도 연다. */}
        <button type="button" className="btn" onClick={() => setEvOpen(true)}>검증 근거</button>
        {loggedIn ? <DeleteButton runId={run.run_id} /> : null}
      </PageHeader>
      <EvidenceDialog open={evOpen} onClose={() => setEvOpen(false)} />
    </>
  );
  if (run.status === "inconclusive" || run.report?.inconclusive) {
    return <>{header}<Inconclusive run={run} /></>;
  }
  if (!run.report) {
    // 끝났다는데 리포트가 없다 — 없는 결과를 빈 리포트로 그리지 않는다.
    return <>{header}<RunError run={{ ...run, error: run.error ?? { code: "report_missing" } }} /></>;
  }
  const onSignup = () => setAuthOpen(true);
  const focus = (location.state as { focus?: string } | null)?.focus === "findings";
  return (
    <>
      {header}
      {fid ? <FindingDetail run={run} fid={fid} /> : <ReportBody run={run} onSignup={onSignup} focusFindings={focus} />}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => setTick((x) => x + 1)} />
    </>
  );
}
