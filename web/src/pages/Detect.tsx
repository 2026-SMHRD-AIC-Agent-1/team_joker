// JOKER-KO 탐지기 — 문구 하나가 한국어 프롬프트 인젝션인지 판정한다.
// ★ 우리는 운영 트래픽을 감시하지 않는다. 대시보드처럼 보이게 만들면 없는 기능을 파는 것이 된다.
// ★ 탐지 모델(1.1GB)은 gitignore 라 PC 마다 없을 수 있다. 버튼 누른 뒤 503 으로 알리면 늦다 — 들어오자마자 알린다.
import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { api, ApiError, NetworkError } from "../api/client";
import type { DetectResult } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { SubSection } from "../components/Section";
import { Failure, ServerDown } from "../components/States";
import { useHealth } from "../hooks/useHealth";
import { DETECT_EXAMPLES } from "../lib/examples";
import type { DetectPrefill } from "../lib/examples";
import { VERDICT_COLOR } from "../lib/meta";

export function flagList(flags: DetectResult["rule_flags"] | undefined | null): string[] {
  if (!flags) return [];
  return Array.isArray(flags) ? flags : Object.keys(flags);
}

export function DetectionCard({ d }: { d: DetectResult }) {
  const inj = d.is_injection;
  const score = d.score ?? 0;
  const thr = d.threshold ?? 0.5;
  const flags = flagList(d.rule_flags);
  const color = inj ? VERDICT_COLOR.leak : VERDICT_COLOR.block;
  return (
    <div data-testid="detection">
      <div className="card" style={{ borderColor: `${color}33`, background: `${color}0A` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
          <div style={{ fontWeight: 800, color, fontSize: "1rem" }}>{inj ? "INJECTION — 공격 의심" : "SAFE — 정상 입력"}</div>
        </div>
      </div>
      <div className="det-grid">
        <div>
          <div className="ml">ML 모델 점수</div>
          <div className="mv num" style={{ color }}>{(score * 100).toFixed(1)}%</div>
          <div className="bar" role="img" aria-label={`ML 모델 점수 ${(score * 100).toFixed(1)}%`}>
            <i style={{ width: `${Math.min(Math.max(score, 0), 1) * 100}%`, background: color }} />
          </div>
          <p className="fine">threshold {thr}</p>
        </div>
        <div>
          {flags.length ? (
            <>
              <div><b>규칙 탐지(난독화):</b> {flags.map((f) => <span className="pill" key={f}>{f}</span>)}</div>
              {score < thr && inj ? (
                <div className="notice" style={{ marginTop: 10 }}>💡 ML 점수은 낮지만(놓칠 뻔), <b>규칙 필터가 난독화를 잡아</b> 최종 INJECTION 으로
                  판정했습니다 → ML + 규칙 <b>2중 방어</b>가 작동한 예입니다.</div>
              ) : null}
            </>
          ) : <p className="fine">규칙(난독화) 신호 없음 — 판정은 ML 점수 기준입니다.</p>}
        </div>
      </div>
      <p className="fine">모델: <code>{d.model}</code></p>
    </div>
  );
}

export function Detect({ embedded = false }: { embedded?: boolean }) {
  const location = useLocation();
  const prefill = (location.state as DetectPrefill | null) ?? null;
  const h = useHealth();
  const [text, setText] = useState(prefill?.text ?? "");
  const [from, setFrom] = useState<DetectPrefill["from"] | null>(prefill?.from ?? null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [fail, setFail] = useState<unknown>(null);
  const [warn, setWarn] = useState(false);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    setFail(null);
    if (!text.trim()) { setWarn(true); return; }
    setWarn(false);
    setBusy(true);
    try {
      setResult(await api.post<DetectResult>("/api/detect", { text: text.trim() }));
    } catch (err) {
      setFail(err);
    } finally {
      setBusy(false);
    }
  };

  const noModel = (
    <div className="notice" role="status">JOKER-KO 모델을 현재 사용할 수 없거나 검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요. 지시문 진단은 계속 사용할 수 있으며 ML 추가 검사는 미실행으로 표시됩니다.</div>
  );

  return (
    <>
      {!embedded && <PageHeader title="입력문 검사" desc="입력문 하나의 공격 의도를 확인합니다." />}
      {h && !h.detector_ready ? noModel : null}
      <SubSection title="예시로 넣어보기" />
      <div className="ex-grid">
        {DETECT_EXAMPLES.map((x) => (
          <button type="button" key={x.label} className="btn btn-block" onClick={() => { setText(x.text); setFrom(null); setResult(null); }}>{x.label}</button>
        ))}
      </div>
      <form onSubmit={run}>
        <div className="ws-h" style={{ marginTop: 16 }}>
          <span className="ws-t"><i />사용자 입력 문구</span><span className="ws-m">문구를 저장하지 않는 단건 검사</span>
        </div>
        <textarea className="textarea" rows={4} aria-label="검사할 입력 문구" value={text}
          onChange={(e) => { setText(e.target.value); setFrom(null); }} placeholder="사용자가 챗봇에 보낼 법한 문구를 넣어보세요." />
        {from ? (
          <p className="fine" data-testid="prefill-note">
            {from === "demo" ? "리포트에서 넘어왔습니다 — 이 문장은 진단 결과가 아니라 화면이 넣어 준 난독화 예시입니다."
              : from === "residual" ? "리포트에서 넘겨받은 문구입니다 — 보강 후에도 뚫린 공격 1건입니다."
              : "리포트의 발견 항목에서 넘겨받은 공격 문구입니다."}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 10, minWidth: 180 }} disabled={busy}>
          {busy ? "판정하는 중…" : "탐지 실행 →"}
        </button>
      </form>
      {warn ? <div className="alert alert-warn" role="alert" style={{ marginTop: 12 }}>검사할 문구를 입력해 주세요.</div> : null}
      <div style={{ marginTop: 16 }}>
        {result ? <DetectionCard d={result} /> : null}
        {fail ? (fail instanceof ApiError && fail.status === 503 ? noModel
          : fail instanceof ApiError ? (
            <Failure icon="⚠️" title="탐지에 실패했습니다" why={fail.message} code={fail.code}
              actions={["문구를 바꿔 다시 시도", "반복되면 API 서버 로그 확인"]} />
          ) : fail instanceof NetworkError ? <ServerDown /> : <ServerDown />) : null}
      </div>

    </>
  );
}
