// 첫 방문 화면. 주인공은 가운데 인증 패널이고, 그 바로 아래가 무료 체험이다.
// ★ 큰 홍보 문구·장식 차트를 두지 않는다. 인증 진입점은 가운데 패널 하나뿐이다.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// ★ 수집 고지 — 보안 진단 서비스가 자기 수집이 과하면 자기모순이다(개인정보보호법 §16 최소수집).
export const SIGNUP_PRIVACY = "이름 · 휴대폰번호 · 생년월일은 수집하지 않습니다.";
export const SIGNUP_HASH_NOTE = "※ 비밀번호는 scrypt 단방향 해시로 저장되며 평문으로 보관하지 않습니다.";

export function AuthForm({ onDone }: { onDone?: (claimed: boolean) => void }) {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = tab === "login" ? await login(email, pw) : await signup(email, pw, pw2);
    setBusy(false);
    if (r.error) setError(r.error);   // ★ 서버 문구 그대로 — 어느 항목이 틀렸는지 구분하지 않는다
    else onDone?.(r.claimed);
  };

  return (
    <>
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === "login"} onClick={() => { setTab("login"); setError(null); }}>로그인</button>
        <button className="tab" role="tab" aria-selected={tab === "signup"} onClick={() => { setTab("signup"); setError(null); }}>회원가입</button>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" className="input" type="email" autoComplete="email" placeholder="you@example.com"
                 value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호</label>
          <input id="pw" className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                 autoComplete={tab === "login" ? "current-password" : "new-password"} required />
          {tab === "signup" ? <span className="help">영문과 숫자를 포함해 8자 이상</span> : null}
        </div>
        {tab === "signup" ? (
          <div className="field">
            <label htmlFor="pw2">비밀번호 확인</label>
            <input id="pw2" className="input" type="password" autoComplete="new-password" value={pw2}
                   onChange={(e) => setPw2(e.target.value)} required />
          </div>
        ) : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? (tab === "login" ? "로그인하는 중…" : "계정을 만드는 중…") : (tab === "login" ? "로그인" : "무료로 가입하기")}
        </button>
      </form>
      {tab === "login" ? (
        <p className="auth-note">
          처음이라면 <b>회원가입</b>을 선택하세요. 카드 정보는 필요 없습니다.
        </p>
      ) : (
        <>
          <p className="fine">※ <b>{SIGNUP_PRIVACY}</b> 진단 이력 저장에 필요한 최소 정보만 받습니다.</p>
          <p className="fine">{SIGNUP_HASH_NOTE}</p>
        </>
      )}
    </>
  );
}

export function AuthPage() {
  const nav = useNavigate();
  const { guest, lastRunId } = useAuth();
  const exhausted = guest.remaining === 0;
  return (
    <div className="main-narrow">

      <div className="auth-grid">
        <div>
          <div className="auth-brand"><span className="dot" /><span className="m">Chat Shield</span></div>
          {/* ★ 서비스 소개 문구는 첫 화면(/)에만 둔다 — 여기에 또 쓰면 같은 말을 문구만 다르게 두 번 하게 된다.
              이 화면이 답할 것은 "왜 계정이 필요한가" 하나다. */}
          <div className="input-intro">계정이 있으면<br />진단 기록이 남습니다.</div>
          <div className="auth-desc">무료 가입하면 <b>상세 결과와 수정안 전체</b>를 보고, 지난 진단을 다시 확인할 수 있습니다.</div>
          {[["1", "지금 실행한 진단이 그대로 열립니다", "가입 직후 방금 결과가 이어집니다 — 다시 진단하지 않아도 됩니다."],
            ["2", "상세 증거와 수정안 전문", "공격 문구·응답 전문·원본↔수정안 비교가 열립니다."],
            ["3", "이메일과 비밀번호만", "이름·휴대폰번호·생년월일은 수집하지 않습니다."]].map(([n, t, d]) => (
            <div className="next-action" key={n}><span className="step">{n}</span><div><b>{t}</b><p>{d}</p></div></div>
          ))}
          <p className="fine"><Link to="/">← 서비스가 무엇인지 먼저 보기</Link></p>
        </div>
        <div className="authbox">
          <div className="auth-panel-t">진단 기록과 수정안을 이어서 보려면 로그인하세요.</div>
          <AuthForm onDone={(claimed) => nav(claimed && lastRunId ? `/runs/${encodeURIComponent(lastRunId)}` : "/dashboard")} />
          <div className="auth-div">또는</div>
          {lastRunId ? <Link className="btn btn-block" to={`/runs/${encodeURIComponent(lastRunId)}`}>{guest.runningRunId ? "진행 중인 진단으로 돌아가기" : "이전 진단 결과 보기"}</Link> : null}
          <button className="btn btn-block" disabled={exhausted}
                  onClick={() => { if (guest.runningRunId) nav(`/runs/${encodeURIComponent(guest.runningRunId)}`); else nav("/diagnose"); }}>
            회원가입 없이 무료 진단 1회
          </button>
          {exhausted ? (
            <p className="auth-note">무료 체험을 이미 사용했습니다. 위에서 <b>무료 회원가입</b>을 하면 추가 진단을 실행할 수 있고,
              이전에 체험한 결과의 상세도 함께 열립니다.</p>
          ) : (
            <p className="auth-note">요약 결과는 바로 확인하고, <b>상세 분석과 수정안은 무료 가입 후</b> 확인할 수 있습니다.
              가입하면 방금 실행한 진단이 그대로 열립니다.</p>
          )}
          {guest.remaining === null ? (
            <p className="fine">🎟️ 무료 체험 잔여 횟수를 확인하지 못했습니다 — 잠시 후 다시 시도해 주세요.</p>
          ) : guest.limitNote && !exhausted ? <p className="fine">🎟️ {guest.limitNote}</p> : null}
        </div>
      </div>

    </div>
  );
}
