// 새 진단 — 지시문 입력 · 예시 · 고급 설정(모델 · 정밀도 · BYOK) · 시작.
//
// ★ 예시 선택은 입력창을 채울 뿐 — 진단을 시작하지도, 유료 모델을 호출하지도 않는다.
//   이미 쓴 글을 말없이 덮어쓰지 않는다(확인을 한 번 받는다).
// ★ BYOK 키는 저장하지 않는다. 요청 본문으로만 보내고, 시작 직후 화면 상태에서도 지운다.
// ★ 무료 체험 횟수는 서버가 센다. 화면은 서버가 준 잔여 횟수와 거절 사유를 그대로 보여 준다.
import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/client";
import type { Models, Preset } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { rememberStart } from "../auth/session";
import { AuthDialog } from "../components/AuthDialog";
import { PageHeader } from "../components/PageHeader";
import { Failure, ServerDown } from "../components/States";
import { useApi } from "../hooks/useApi";
import { EXAMPLE_PROMPTS } from "../lib/examples";

type Mode = "screening" | "full";

export function quotaLine(remaining: number | null, note: string): string {
  // ★ 실제 제한 단위를 그대로 말한다 — '사람당 1회' 라고 하지 않는다(서버의 limit_note).
  if (remaining === null) return "무료 체험 잔여 횟수를 확인하지 못했습니다. 진단 시작은 서버가 다시 확인합니다.";
  if (remaining > 0) return `무료 체험 ${remaining}회 남았습니다. ${note}`.trim();
  return `무료 체험을 모두 사용했습니다. ${note} 무료 가입하면 추가 진단을 실행할 수 있습니다.`.replace(/\s+/g, " ");
}

function ExamplePicker({ prompt, setPrompt }: { prompt: string; setPrompt: (v: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const apply = (id: string) => {
    const ex = EXAMPLE_PROMPTS.find((e) => e.id === id);
    if (ex) { setPrompt(ex.text); setApplied(id); }
    setPending(null);
  };
  const pick = (id: string) => {
    const ex = EXAMPLE_PROMPTS.find((e) => e.id === id)!;
    if (prompt.trim() && prompt !== ex.text) setPending(id);
    else apply(id);
  };
  const pendingEx = EXAMPLE_PROMPTS.find((e) => e.id === pending);
  const appliedEx = EXAMPLE_PROMPTS.find((e) => e.id === applied);
  return (
    <>
      <div className="t-desc">아래를 고르면 입력창이 채워집니다. 그대로 진단해도 되고, 내 챗봇 지시문에 맞게 고쳐도 됩니다.{" "}
        <b>고르는 것만으로는 진단이 시작되지 않습니다.</b></div>
      <div className="ex-grid">
        {EXAMPLE_PROMPTS.map((ex) => (
          <div key={ex.id}>
            <button type="button" className="btn btn-block" onClick={() => pick(ex.id)}>{ex.label}</button>
            <div className="ex-d">{ex.desc}</div>
          </div>
        ))}
      </div>
      {pendingEx ? (
        <div className="alert alert-warn" role="alert">
          입력창에 이미 작성한 내용이 있습니다. <b>{pendingEx.label}</b> 예시로 바꾸면 지금 입력한 내용은 사라집니다.
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => apply(pendingEx.id)}>예시로 바꾸기</button>
            <button type="button" className="btn" onClick={() => setPending(null)}>취소</button>
          </div>
        </div>
      ) : appliedEx && prompt.trim() === appliedEx.text.trim() ? (
        <div className="checkline">선택한 예시 — <b>{appliedEx.label}</b>. 아래 입력창에서 자유롭게 고칠 수 있습니다.</div>
      ) : null}
    </>
  );
}

interface Byok { base_url: string; model: string; api_key: string }

function Advanced({ models, loadFailed, presetId, setPresetId, mode, setMode, byok, setByok }: {
  models: Models | null; loadFailed: boolean; presetId: string | null; setPresetId: (v: string) => void;
  mode: Mode; setMode: (m: Mode) => void; byok: Byok; setByok: (b: Byok) => void;
}) {
  const chosen: Preset | undefined = models?.presets.find((p) => p.id === presetId);
  return (
    <details className="xp">
      <summary>고급 설정 — 진단 대상 모델 · 정밀도</summary>
      <div className="xp-body">
        {loadFailed ? <div className="alert alert-warn">모델 목록을 불러오지 못했습니다. 서버의 기본 모델로 진단합니다.</div> : null}
        <div className="adv-grid">
          {models ? (
            <div className="field">
              <label htmlFor="preset">진단 대상 모델</label>
              <select id="preset" className="select" value={presetId ?? ""} onChange={(e) => setPresetId(e.target.value)}>
                {models.presets.map((p) => <option key={p.id} value={p.id}>{p.label}{p.verified ? "" : "  · 실험적"}</option>)}
              </select>
              {chosen?.fidelity === "proxy_model" ? <span className="help">대리 모델 진단 — 결과에 ‘대리 모델’ 칩이 붙습니다.</span> : null}
            </div>
          ) : null}
          <fieldset className="field radio-set">
            <legend>정밀도</legend>
            <label><input type="radio" name="mode" checked={mode === "screening"} onChange={() => setMode("screening")} /> 스크리닝 (~90초)</label>
            <label><input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} /> 정밀 (전량, 수 분)</label>
          </fieldset>
        </div>
        {chosen?.requires_key ? (
          <>
            <div className="notice">키는 저장하지 않습니다. 진단 1회 후 즉시 폐기됩니다.</div>
            <div className="adv-grid three">
              <div className="field"><label htmlFor="burl">base_url (OpenAI 호환)</label>
                <input id="burl" className="input" value={byok.base_url} onChange={(e) => setByok({ ...byok, base_url: e.target.value })} /></div>
              <div className="field"><label htmlFor="bmodel">모델명</label>
                <input id="bmodel" className="input" value={byok.model} onChange={(e) => setByok({ ...byok, model: e.target.value })} /></div>
              <div className="field"><label htmlFor="bkey">API 키</label>
                <input id="bkey" className="input" type="password" autoComplete="off" value={byok.api_key}
                  onChange={(e) => setByok({ ...byok, api_key: e.target.value })} />
                <span className="help">저장하지 않습니다. 요청 바디로만 전송됩니다.</span></div>
            </div>
            <p className="fine">⚠ BYOK: 진단이 대상 모델을 여러 번 호출합니다 — 요금이 발생합니다.</p>
          </>
        ) : null}
      </div>
    </details>
  );
}

export function NewRun() {
  const nav = useNavigate();
  const { loggedIn, guest, rememberRun, refreshGuest } = useAuth();
  const models = useApi<Models>("/api/models");
  const [prompt, setPrompt] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("screening");
  const [byok, setByok] = useState<Byok>({ base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", api_key: "" });
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [failure, setFailure] = useState<ReactNode>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const preset = presetId ?? models.data?.default ?? null;

  const start = async () => {
    setWarn(null);
    setFailure(null);
    if (!prompt.trim()) { setWarn("진단할 시스템 지시문을 입력하세요."); return; }
    const chosen = models.data?.presets.find((p) => p.id === preset);
    const body: Record<string, unknown> = { target_prompt: prompt.trim(), mode };
    if (chosen) {
      body.target = chosen.requires_key ? { preset: chosen.id, ...byok } : { preset: chosen.id };
    }
    setBusy(true);
    try {
      const r = await api.post<{ run_id: string; estimated_calls?: number }>("/api/diagnose", body);
      setByok((b) => ({ ...b, api_key: "" }));
      rememberRun(r.run_id);
      rememberStart({ runId: r.run_id, mode, at: Date.now() });
      if (!loggedIn) void refreshGuest();
      nav(`/runs/${encodeURIComponent(r.run_id)}`);
    } catch (e) {
      if (e instanceof NetworkError || !(e instanceof ApiError)) { setFailure(<ServerDown />); return; }
      if (e.code === "guest_run_in_progress" && e.runId) {
        // ★ 새로고침·중복 클릭. 같은 진단을 두 번 시작하지 않고 그 진단으로 되돌린다.
        rememberRun(e.runId);
        nav(`/runs/${encodeURIComponent(e.runId)}`);
        return;
      }
      setFailure(startFailure(e, guest.limitNote, () => setAuthOpen(true)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="챗봇 지시문 진단" desc="한국어 공격으로 시험하고, 보강 전후의 차이를 확인하세요." />
      <details className="xp">
        <summary>지시문이 없다면 예시로 시작하기</summary>
        <div className="xp-body"><ExamplePicker prompt={prompt} setPrompt={(v) => { setPrompt(v); setWarn(null); }} /></div>
      </details>
      <label className="evidence-label" htmlFor="prompt" style={{ display: "block" }}>진단할 시스템 지시문</label>
      <p className="fine" style={{ marginTop: 0 }}>사용자의 질문이 아니라, 챗봇에 설정한 역할과 규칙을 입력하세요. 실제 비밀값 대신 테스트용 값을 사용하세요.</p>
      <textarea id="prompt" className="textarea" rows={9} value={prompt} onChange={(e) => { setPrompt(e.target.value); setWarn(null); }}
        placeholder={"너는 사내 IT 안내 봇이야. 테스트 접근코드는 DEMO-1234이며 공개하면 안 돼.\n직원의 계정과 장비 문의를 도와줘."} />
      <Advanced models={models.data} loadFailed={Boolean(models.error)} presetId={preset} setPresetId={setPresetId}
        mode={mode} setMode={setMode} byok={byok} setByok={setByok} />
      <div className="cta-row">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={start}>{busy ? "시작하는 중…" : "보안 진단 시작"}</button>
        <span className="fine" style={{ margin: 0 }}>{mode === "full" ? "정밀 3~4분" : "기본 스크리닝 약 90초"} · 모델과 대기 상황에 따라 달라집니다.</span>
      </div>
      <p className="fine">진단 범위: 지시문 + 선택 모델. 실제 서비스의 RAG·도구 호출·대화 이력은 포함하지 않습니다.</p>
      {!loggedIn ? <p className="fine" data-testid="quota">🎟️ {quotaLine(guest.remaining, guest.limitNote)}</p> : null}
      {warn ? <div className="alert alert-warn" role="alert">{warn}</div> : null}
      {failure}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => setFailure(null)} />
    </>
  );
}

/** 시작 거절 사유별 화면. 서버 문구(message)는 그대로 쓰고, 다음에 할 일은 코드로 가른다. */
export function startFailure(e: ApiError, limitNote: string, openAuth: () => void): ReactNode {
  switch (e.code) {
    case "guest_quota_exhausted":
      return (
        <>
          <Failure icon="🎟️" title="무료 체험 진단을 모두 사용했습니다" code={e.code} tone="warn"
            why={<>{e.message}{limitNote ? <><br />{limitNote}</> : null}</>}
            actions={[<><b>무료 회원가입</b> 후 추가 진단 실행 (카드 정보 없음)</>, "이미 계정이 있다면 로그인"]} />
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={openAuth}>로그인 · 회원가입</button>
        </>
      );
    case "guest_session_required":
      return (
        <Failure icon="🔄" title="방문자 세션이 만료됐습니다" code={e.code} tone="warn"
          why={`${e.message} 무료 체험 횟수는 서버가 세기 때문에, 세션이 없으면 시작할 수 없습니다.`}
          actions={["브라우저를 새로고침한 뒤 다시 시도", "계속 반복되면 API 서버가 떠 있는지 확인"]} />
      );
    case "budget_too_low":
      // 3~4분 뒤에 죽는 대신 시작 전에 막은 경우.
      return (
        <Failure icon="🛑" title="호출 상한이 이 진단에 모자랍니다" code={e.code} tone="warn"
          why={<>{e.message}<br />지금 시작하면 중간에 상한에 걸려 <b>결과가 저장되지 않은 채</b> 중단됩니다. 그래서 시작 전에 막았습니다.</>}
          actions={[<><code>.env</code> 의 <code>JOKER_MAX_CALLS</code> 를 올리고 API 서버 재시작</>,
            <>또는 <b>고급 설정</b> 에서 정밀도를 <b>스크리닝</b> 으로 낮추기</>]} />
      );
    case "target_unreachable":
      return (
        <Failure icon="🔌" title="대상 모델에 연결하지 못했습니다" code={e.code}
          why={<><b>Chat Shield 의 장애가 아닙니다.</b> 진단을 시작하기 전에 대상 모델을 한 번 호출해 보는데(프리플라이트) 여기서
            실패했습니다. 잘못된 키로 3~4분과 요금을 날리지 않으려고 미리 검사합니다.</>}
          actions={[<><b>고급 설정</b> 에서 base_url · 모델명 · API 키 확인</>, <>로컬 모델이면 <code>ollama serve</code> 가 떠 있는지 확인</>]} />
      );
    default:
      return (
        <Failure icon="⚠️" title="진단을 시작할 수 없습니다" code={e.code} why={e.message}
          actions={[<>입력한 지시문과 <b>고급 설정</b> 을 확인하고 다시 시도</>]} />
      );
  }
}
