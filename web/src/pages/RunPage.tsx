// 진단 한 건 — 진행 / 결과 / 진단 불가 / 실패 네 상태를 한 라우트가 맡는다(/runs/:runId, /runs/:runId/f/:fid).
//
// ★ 서버가 소유자·게이팅을 판단한다. 이 화면은 받은 것만 그린다 — 비회원 응답에는 증거 상세가 애초에 없다.
// ★ 남의 진단·없는 진단은 서버가 둘 다 404 로 답한다(IDOR). 화면도 둘을 구분하지 않는다.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/client";
import type { Report, Run } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { getStart } from "../auth/session";
import { AuthDialog } from "../components/AuthDialog";
import { Dialog } from "../components/Dialog";
import { Breadcrumb, PageHeader } from "../components/PageHeader";
import { Section } from "../components/Section";
import { EmptyState, Failure, ServerDown, Skeleton } from "../components/States";
import { EvidenceDialog } from "../components/ToolEvidence";
import { scrollUnderTopbar } from "../lib/scroll";
import { EvidenceCards } from "../components/report/Evidence";
import { FindingDetail } from "../components/report/FindingDetail";
import { Findings } from "../components/report/Findings";
import { Hero } from "../components/report/Hero";
import { DetectorCta, FilterAction, LayerRelation } from "../components/report/Layers";
import { Inconclusive, RunError } from "../components/report/Outcomes";
import { Prescription } from "../components/report/Prescription";
import { ProgressView } from "../components/report/Progress";
import { Stats, TechniqueBars } from "../components/report/Stats";
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

/**
 * ★ 0914 복구: 4탭으로 나누면서 사라졌던 경고다.
 * '보강 후 신규' 가 한 건이라도 있으면 보강안을 그대로 복사해 가는 것이 위험하다 —
 * 그 사실을 '자세한 기록' 탭 문장 하나에만 두면 요약만 보고 적용하는 경로에서 아무 말도 안 하게 된다.
 * 그래서 요약 탭과 보강안 탭 두 곳에 모두 띄운다(안전 문구는 중복을 감수한다).
 */
function RegressedAlert({ rep, onOpen }: { rep: Report; onOpen?: () => void }) {
  const n = rep.findings_summary?.regressed ?? 0;
  if (!n) return null;
  return (
    <div className="alert alert-warn" data-testid="regressed-alert">
      <b>보강 후 새로 유출된 요청이 {n}건 있습니다.</b> 보강 전에는 막혔는데 보강 후 뚫린 항목입니다.
      보강안을 적용하기 전에 이 항목부터 재검증하세요.
      {onOpen ? <> <button type="button" className="btn btn-link" onClick={onOpen}>해당 항목 보기 →</button></> : null}
    </div>
  );
}

export function ReportBody({ run, onSignup, focusFindings }: { run: Run; onSignup: () => void; focusFindings: boolean }) {
  const rep = run.report!;
  const gated = run.gated ?? { is_gated: false };
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("section") ?? (focusFindings ? 1 : 0));
  const section = Number.isInteger(requested) && requested >= 0 && requested <= 3 ? requested : 0;
  const setSection = (value: number) => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("section", String(value)); return next; }, { replace: true });
    // ★ 탭은 쿼리만 바꾸므로 Layout 의 pathname 스크롤 초기화가 걸리지 않는다 — 여기서 직접 올린다.
    // ★ scrollIntoView 를 쓰지 않는다(0915): 탭바가 sticky(top:88) 라 '이미 붙어 있는 자리' 로
    //   계산돼, 탭을 누르면 패널 첫 제목이 탭바 뒤에 숨었다(실측: 제목 y=132, 탭바 88~173).
    //   상단바 높이만큼만 올리면 탭바는 제 자리에 붙고 내용은 그 바로 아래에서 시작한다.
    requestAnimationFrame(() => {
      const nav = document.getElementById("report-navigation");
      if (nav) scrollUnderTopbar(nav);
    });
  };
  useEffect(() => { if (focusFindings) setSection(1); }, [focusFindings]);
  const labels = ["결과 요약", "발견된 문제", "지시문 보강안", "자세한 기록"];
  return <>
    <div className="report-navigation" id="report-navigation" role="tablist" aria-label="진단 결과 구역">
      {labels.map((label, i) => <button id={`report-tab-${i}`} key={label} role="tab" aria-selected={section === i} aria-controls="report-panel" tabIndex={section === i ? 0 : -1}
        onKeyDown={e => { let next = i; if (e.key === "ArrowRight") next = (i + 1) % 4; else if (e.key === "ArrowLeft") next = (i + 3) % 4; else if (e.key === "Home") next = 0; else if (e.key === "End") next = 3; else return; e.preventDefault(); setSection(next); document.getElementById(`report-tab-${next}`)?.focus(); }}
        onClick={() => setSection(i)}><span>0{i + 1}</span>{label}</button>)}
    </div>
    <section id="report-panel" role="tabpanel" aria-labelledby={`report-tab-${section}`} className="report-panel" tabIndex={0}>
      <div className="page-transition" key={section}>
      {section === 0 ? <><Hero rep={rep} assetsN={run.recon?.assets ? run.recon.assets.length : null} />
        <RegressedAlert rep={rep} onOpen={() => setSection(1)} />
        {rep.by_technique?.length ? <>
          <Section title="공격 기법별 보강 전 → 후" desc="어떤 구조의 공격이 남았는지가 다음에 무엇을 막아야 하는지를 말해 줍니다." />
          <TechniqueBars rows={rep.by_technique} />
        </> : null}
        <ScopeNote run={run} />
        <div className="summary-next"><div><span className="eyebrow">NEXT STEP</span><h2>확인하고, 검토한 뒤 적용하세요.</h2><p>실제 질문과 응답을 확인하고 지시문 보강안을 검토하세요.</p></div><div className="btn-row"><button className="btn btn-primary" onClick={() => setSection(1)}>발견된 문제 확인 →</button><button className="btn" onClick={() => setSection(2)}>보강안 확인</button></div></div></> : null}
      {section === 1 ? <><EvidenceCards rep={rep} gated={gated} onSignup={onSignup} /><Findings runId={run.run_id} rep={rep} gated={gated} onSignup={onSignup} /></> : null}
      {/* ★ 0914 복구: 관계도(LayerRelation)를 보강안 맨 위로 되살렸다 — 아래 권고 1번이 왜 나왔는지를 그림으로 먼저 보인다.
          4탭 전환 때 import 가 빠져 화면에서 사라져 있었다(코드는 Layers.tsx 에 그대로 남아 있었다). */}
      {section === 2 ? <><LayerRelation residual={rep.filter_recommendation?.residual ?? 0} />
        <RegressedAlert rep={rep} onOpen={() => setSection(1)} />
        <Prescription rep={rep} gated={gated} onSignup={onSignup} />
        <Section title="권고 조치" desc="문구 보강만으로 끝내지 않고, 적용한 뒤 정상 업무까지 확인하세요." />
        <FilterAction rep={rep} index={1} /><DetectorCta rep={rep} />
        <div className="next-action"><span className="step">2</span>
          <div><b>비밀값을 지시문 밖으로 옮기세요</b><p>실제 비밀번호와 접근키는 서버에서 보관하고 인증·권한 검사로 접근을 제어하세요.</p></div></div></> : null}
      {section === 3 ? <><Section title="통계와 측정 조건" desc="이번 진단의 모델, 시험 범위와 판정 기록입니다." /><Stats run={run} rep={rep} /></> : null}
      </div>
    </section>
  </>;
}

/**
 * 진행 중인 진단 중단.
 *
 * ★ 확인을 한 번 받는다 — 멈추면 그때까지 던진 공격은 버려진다(서버가 아무것도 저장하지 않는다).
 *   BYOK 라면 이미 나간 호출 요금은 되돌아오지 않으므로 그 사실도 같이 말한다.
 * ★ 누른 직후 폴링이 상태를 다시 읽는다. '멈추는 중' 을 화면이 지어내지 않고 서버가 준 상태로만 바뀐다.
 */
function CancelButton({ runId, onCancelled }: { runId: string; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = useCallback(() => { setOpen(false); setErr(null); }, []);
  const stop = async () => {
    setBusy(true);
    try {
      await api.post(`/api/runs/${encodeURIComponent(runId)}/cancel`, {});
      setOpen(false);
      setRequested(true);
      onCancelled();
    } catch (e) {
      // 이미 끝난 진단이면 서버가 409 를 준다 — 실패가 아니라 '늦었다' 이므로 그대로 결과를 읽는다.
      if (e instanceof ApiError && e.code === "not_running") { setOpen(false); onCancelled(); return; }
      setErr(e instanceof ApiError ? e.message : "진단 서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  // ★ 요청이 접수된 뒤에도 화면은 잠시 '진행 중' 이다 — 엔진은 지금 던지고 있는 공격 1건을
  //   마친 뒤 확인 지점에서 멈춘다. 그 사이를 비워 두면 사용자는 버튼이 안 먹은 줄 알고 다시 누른다.
  //   여기서 말하는 것은 '서버가 요청을 받았다'(204) 까지다 — 멈췄다고 앞질러 말하지 않는다.
  if (requested) {
    return <span className="checkline" role="status" style={{ margin: 0 }}>
      중단을 요청했습니다 — 지금 던지고 있는 공격 1건이 끝나면 멈춥니다.
    </span>;
  }
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>진단 중단</button>
      <Dialog title="진행 중인 진단을 중단할까요?" open={open} onClose={close}>
        <p>지금까지 던진 공격 결과는 <b>저장되지 않고 버려집니다</b>. 결과를 보려면 처음부터 다시 진단해야 합니다.</p>
        <p className="fine">내 API 키로 진단 중이라면 이미 나간 호출의 요금은 되돌릴 수 없습니다.</p>
        <p className="mono fine">{runId}</p>
        {err ? <div className="form-error" role="alert">{err}</div> : null}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={close}>계속 진행</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={stop}>{busy ? "중단하는 중…" : "진단 중단"}</button>
        </div>
      </Dialog>
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
        <div className="btn-row" style={{ marginTop: 12 }}>
          <CancelButton key={run.run_id} runId={run.run_id} onCancelled={() => setTick((x) => x + 1)} />
          <span className="fine" style={{ margin: 0 }}>창을 닫아도 진단은 서버에서 계속됩니다.</span>
        </div>
      </>
    );
  }
  if (run.status === "cancelled") {
    // ★ 취소를 '실패' 화면으로 그리지 않는다 — 사용자가 누른 정지와 도구의 고장은 다른 사건이다.
    return (
      <>
        <Breadcrumb parts={["새 진단", "중단됨"]} />
        <PageHeader title="진단을 중단했습니다" />
        <EmptyState icon="⏹" title="요청하신 대로 진단을 멈췄습니다"
          why={<>진단은 끝까지 돌아야 <b>보강 전 → 후</b>를 같은 공격으로 비교할 수 있습니다. 중간까지의 결과는
            57건 기준의 수치와 나란히 둘 수 없어 <b>저장하지 않았습니다</b> — 기록에도 남지 않습니다.</>}
          action={<Link className="btn btn-primary" to="/diagnose#start">＋ 새 진단 시작</Link>} />
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
