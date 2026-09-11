import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Health, Models } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Section } from "../components/Section";
import { ServerDown, Skeleton } from "../components/States";
import { ToolEvidence } from "../components/ToolEvidence";
import { useApi } from "../hooks/useApi";

export function Settings() {
  const health = useApi<Health>("/api/health");
  const models = useApi<Models>("/api/models");
  const { loggedIn, email, logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return <>
    <PageHeader title="설정" desc="엔진 연결 상태, 사용 가능한 모델과 계정을 확인하세요.">
      <button className="btn" disabled={health.loading || models.loading} onClick={() => { health.reload(); models.reload(); }}>연결 다시 확인</button>
    </PageHeader>
    <Section title="엔진 연결" />
    <p className="fine">이 웹사이트의 API에 연결됩니다. 서버 주소는 실행 환경에서 설정합니다.</p>
    {health.loading ? <Skeleton rows={3} /> : health.error ? <ServerDown /> : health.data ? <div className="card">
      <p><b>엔진 정상</b> · {health.data.profile}</p>
      {health.data.profile === "mock" ? <div className="alert alert-warn">mock 응답은 실제 측정값이 아닙니다. 인용하지 마세요.</div> : null}
      <p>공격 시드 {health.data.corpus_loaded ?? "—"}개 · 탐지기 {health.data.detector_ready ? "준비됨" : "미준비"} · LangGraph {health.data.langgraph ? "준비됨" : "미준비"}</p>
    </div> : null}
    <Section title="진단 대상 모델" />
    {models.loading ? <Skeleton rows={3} /> : models.error ? <div className="alert alert-warn">모델 목록을 불러오지 못했습니다. 연결을 다시 확인하세요.</div> : models.data?.presets.map(p => <div className="card" key={p.id} style={{ marginBottom: 12 }}>
      <b>{p.label}</b> {p.id === models.data?.default ? <span className="pill">기본</span> : null}
      {!p.verified ? <span className="pill">실험적</span> : null}
      <p className="fine">{p.note}</p>
      {p.requires_key ? <p className="fine">API 키는 진단할 때 입력하며 저장하지 않습니다.</p> : null}
    </div>)}
    <Section title="검증 근거" /><ToolEvidence />
    <Section title="계정" />
    {loggedIn ? <div className="card"><p>로그인 중 · {email}</p><button className="btn" disabled={busy} onClick={async () => { setBusy(true); await logout(); nav("/"); }}>{busy ? "로그아웃 중…" : "로그아웃"}</button></div>
      : <div className="card"><p>비회원입니다. 로그인하면 진단 이력과 보강안 전문을 볼 수 있습니다.</p><Link className="btn" to="/">로그인 · 회원가입</Link></div>}
  </>;
}
