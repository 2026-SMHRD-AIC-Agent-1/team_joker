// 설정 — 엔진 연결 상태 · 진단 대상 모델 · 검증 근거 · 계정.
//
// ★ 계정 칸에는 '되돌릴 수 있는 것' 을 둔다(0915). 이메일 하나만 받으면서 최소수집을 근거로
//   드는 서비스가 비밀번호를 바꿀 방법도, 맡긴 것을 회수할 방법도 안 주면 앞뒤가 안 맞는다
//   (개인정보보호법 §16 최소수집 · §21 파기). 진단 기록에는 고객사 시스템 지시문이 들어 있다.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Health, Models } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Dialog } from "../components/Dialog";
import { PageHeader } from "../components/PageHeader";
import { Section } from "../components/Section";
import { ServerDown, Skeleton } from "../components/States";
import { ToolEvidence } from "../components/ToolEvidence";
import { useApi } from "../hooks/useApi";

/** 서버 문구를 그대로 쓴다 — 화면이 지어내면 서버와 갈린다(api/client.ts 상단 규칙). */
function serverMessage(e: unknown, fallback = "진단 서버에 연결하지 못했습니다."): string {
  return e instanceof ApiError ? e.message : fallback;
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    // ★ '두 번 입력이 다르다' 는 서버에 물어볼 일이 아니다(가입 화면과 같은 규칙).
    if (next !== confirm) { setError("새 비밀번호가 일치하지 않습니다."); return; }
    setBusy(true);
    try {
      await api.post("/api/auth/password", { current_password: current, new_password: next });
      setCurrent(""); setNext(""); setConfirm("");
      setDone(true);
    } catch (err) {
      setError(serverMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="adv-grid three">
        <div className="field">
          <label htmlFor="pw-current">현재 비밀번호</label>
          <input id="pw-current" className="input" type="password" autoComplete="current-password"
                 value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw-next">새 비밀번호</label>
          <input id="pw-next" className="input" type="password" autoComplete="new-password"
                 value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="help">영문과 숫자를 포함해 8자 이상</span>
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">새 비밀번호 확인</label>
          <input id="pw-confirm" className="input" type="password" autoComplete="new-password"
                 value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {done ? <div className="checkline" role="status">비밀번호를 바꿨습니다. <b>다른 기기·탭의 로그인은 모두 해제</b>되고 이 화면만 유지됩니다.</div> : null}
      <p className="fine">본인 확인을 위해 현재 비밀번호가 필요합니다.</p>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "바꾸는 중…" : "비밀번호 변경"}</button>
    </form>
  );
}

function DeleteAccount({ email }: { email: string | null }) {
  const { forgetLogin } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setOpen(false); setError(null); setPassword(""); };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.del("/api/me", { password });
      forgetLogin();
      nav("/");
    } catch (e) {
      setError(serverMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <p><b>회원 탈퇴</b></p>
        <p className="fine">계정과 <b>이 계정으로 저장된 진단 기록 전부</b>가 영구 삭제됩니다. 진단 기록에는
          입력한 시스템 지시문과 공격·응답 기록이 들어 있습니다. 되돌릴 수 없고 백업본도 남기지 않습니다.</p>
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>회원 탈퇴</button>
      </div>
      <Dialog title="정말 탈퇴할까요?" open={open} onClose={close}>
        <p>계정 <b>{email ?? ""}</b> 과 이 계정의 진단 기록이 <b>영구 삭제</b>됩니다. 되돌릴 수 없습니다.</p>
        <div className="field">
          <label htmlFor="del-pw">확인을 위해 비밀번호를 입력하세요</label>
          <input id="del-pw" className="input" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="dlg-actions">
          <button type="button" className="btn" onClick={close}>취소</button>
          <button type="button" className="btn btn-danger" disabled={busy || !password}
                  onClick={remove}>{busy ? "삭제하는 중…" : "영구 삭제"}</button>
        </div>
      </Dialog>
    </>
  );
}

export function Settings() {
  const health = useApi<Health>("/api/health");
  const models = useApi<Models>("/api/models");
  const { loggedIn, email } = useAuth();
  const nav = useNavigate();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return <>
    <PageHeader title="설정" desc="검사 서비스 상태, AI 모델과 내 계정을 확인하세요.">
      <button className="btn" disabled={health.loading || models.loading} onClick={() => { health.reload(); models.reload(); }}>연결 다시 확인</button>
    </PageHeader>
    <Section title="서비스 연결 상태" />
    <p className="fine">검사 서비스를 사용할 수 있는지 확인합니다.</p>
    {health.loading ? <Skeleton rows={3} /> : health.error ? <ServerDown /> : health.data ? <div className="card">
      <p><b>서버 연결됨</b> · {health.data.profile}</p>
      {health.data.profile === "mock" ? <div className="alert alert-warn">mock 응답은 실제 측정값이 아닙니다. 인용하지 마세요.</div> : null}
      <p>시험용 공격 {health.data.corpus_loaded ?? "—"}개 · 메시지 검사 {health.data.detector_ready ? "준비됨" : "미준비"} · 진단 기능 {health.data.langgraph ? "준비됨" : "미준비"}</p>
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
    {loggedIn ? <>
      <div className="card"><p>로그인 중 · {email}</p><button className="btn" disabled={busy} onClick={async () => { setBusy(true); await logout(); nav("/"); }}>{busy ? "로그아웃 중…" : "로그아웃"}</button></div>
      <Section title="비밀번호 변경" />
      <PasswordForm />
      <Section title="계정 삭제" />
      <DeleteAccount email={email} />
    </> : <div className="card"><p>비회원입니다. 로그인하면 진단 이력과 수정안 전문을 볼 수 있습니다.</p><Link className="btn" to="/login">로그인 · 회원가입</Link></div>}
  </>;
}
