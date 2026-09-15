// 진단 후 잔여 유출에 대한 저장된 사후 검사 결과. 운영 차단과 별개입니다.
import { useNavigate } from "react-router-dom";
import type { Report } from "../../api/types";
import { metric } from "../../evidence/metrics";
import { useHealth } from "../../hooks/useHealth";
import { DETECTOR_DEMO_TEXT } from "../../lib/examples";
import type { DetectPrefill } from "../../lib/examples";
import { residualSample } from "../../lib/findings";
import { SubSection } from "../Section";
import { StatRow } from "../StatRow";

// 규칙 사유 이름은 detect_ko_rules._PATTERNS 가 정한 것을 그대로 받고, 화면에서만 읽기 쉬운 말로 바꾼다.
export const FLAG_KO: Record<string, string> = {
  역순요청: "거꾸로 출력 요구", 자모분해요청: "자모·초성 분해 요구", 자모분해: "자모가 분해된 문자열",
  구분자삽입: "글자 사이 구분자 삽입", 인코딩요청: "base64·hex 인코딩 요구", 로마자음차: "로마자 음차 요구",
};

/**
 * 관계도 아래 칸 — 같은 공격 50건 × 방어 구성 4개(검증 데이터).
 * ★ 네 칸을 전부 그린다. '탐지기만' 칸이 '보강만' 보다 낮은데 하나를 빼면 사다리처럼 읽혀 과장이 된다.
 *   한 칸이라도 빠진 표는 그리지 않는다(골라 보여 주기 방지).
 */
export function Ladder() {
  const m = metric("defense_matrix");
  const steps = m?.steps ?? [];
  if (!m || steps.length !== 4) return null;
  // ★ 막대 길이는 value 에 적힌 퍼센트에서만 뽑는다. 퍼센트가 없으면(0건) 0 으로 둔다 —
  //   화면이 길이를 지어내면 그림이 수치보다 커진다.
  const pct = (v: string) => { const m2 = v.match(/([\d.]+)\s*%/); return m2 ? Math.min(100, Number(m2[1])) : 0; };
  return (
    <div className="ladder" data-testid="ladder">
      <div className="lad-h">같은 공격 50건에 방어 구성 네 가지 — <b>이 진단이 아니라 검증 데이터</b></div>
      <div className="lad-bars">
        {steps.map((x, i) => (
          <div className={`lb-row${i === steps.length - 1 ? " lb-best" : ""}`} key={x.label}>
            <span className="lb-l">{x.label}</span>
            <span className="lb-track"><span className="lb-fill" style={{ width: `${pct(x.value)}%` }} /></span>
            <b className="lb-v num">{x.value}</b>
            <span className="lb-d">{x.detail}</span>
          </div>
        ))}
      </div>
      <div className="lad-n">{m.steps_note ?? ""}</div>
    </div>
  );
}

export function LayerRelation({ residual }: { residual: number }) {
  return (
    <div className="rel-card">
      <div className="relation">
        <div className="rel-box done"><span className="tag">이번에 시험한 것</span><b>진단 엔진</b>
          <span className="d">공격을 던져 뚫리는 곳을 찾고, 지시문을 고칩니다.</span></div>
        <div className="rel-link"><span>잔여 유출<br />사후 검사</span><i>▶</i></div>
        <div className="rel-box todo"><span className="tag">추가 탐지 확인</span><b>JOKER-KO 탐지기</b>
          <span className="d">남은 유출 공격의 ML·규칙 탐지 기여를 확인합니다.</span></div>
      </div>
      <Ladder />
      <div className="layers-note in-card"><b>진단 마지막에 잔여 유출을 사후 검사 대상으로 삼습니다.</b>{" "}
        {residual ? <>보강 후 남은 <b>{residual}건</b>의 실제 검사 상태는 아래 결과에서 확인하세요.</>
          : "잔여 유출이 없으면 추가 검사를 실행하지 않습니다."}
      </div>
    </div>
  );
}

/** 권고 조치 1번 — 문구는 서버의 filter_recommendation.note 를 그대로 쓴다(화면이 지어내지 않는다). */
export function FilterAction({ rep, index }: { rep: Report; index: number }) {
  const note = rep.filter_recommendation?.note;
  if (!note) return null;
  return (
    <div className="next-action"><span className="step">{index}</span>
      <div><b>JOKER-KO 추가 탐지 결과를 확인하세요</b><p>{note}</p></div></div>
  );
}

/**
 * 권고 1번 바로 아래의 '직접 시험해 보기'. 넘길 문구가 없는 세 경우를 구분해 말한다
 * (잔여 0 / 비회원이라 attempts 없음 / 있음). 하나로 뭉치면 회원에게 "회원만 됩니다" 라고 말하게 된다.
 */
export function DetectorCta({ rep }: { rep: Report }) {
  const nav = useNavigate();
  const h = useHealth();
  const fr = rep.filter_recommendation;
  if (!fr?.note) return null;
  const sample = residualSample(rep);
  const state: DetectPrefill = sample ? { text: sample, from: "residual" } : { text: DETECTOR_DEMO_TEXT, from: "demo" };
  return (
    <div className="cta-row">
      <button type="button" className="btn btn-primary" onClick={() => nav("/detect", { state })}>
        {sample ? "이 공격 문구로 탐지기 시험 →" : "예시 공격으로 탐지기 시험 →"}
      </button>
      <div className="layers-note" style={{ margin: 0 }}>
        {sample ? "보강 후에도 뚫린 문구 1건을 탐지 화면에 넣어 둡니다."
          : !fr.residual ? <>남은 유출이 없어 <b>난독화 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아닌 고정 문장입니다.</>
          : <>남은 문구는 회원 리포트에서만 넘겨받습니다. 대신 <b>난독화 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아닌 고정 문장입니다.</>}
        {h && !h.detector_ready ? " ※ 이 PC 에는 탐지 모델이 없어 화면에 안내가 뜹니다." : null}
      </div>
    </div>
  );
}

/** 저장된 수치만 표시한다. 미실행은 0건으로 대체하지 않는다. */
export function FilterLayerDetail({ rep }: { rep: Report }) {
  const fr = rep.filter_recommendation;
  const complete = fr?.status === "completed";
  const noTargets = fr?.status === "no_targets";
  const legacy = !fr?.status || fr.status === "not_recorded";
  const count = (n: number | null | undefined) => n == null ? "미검사" : `${n}건`;
  return <div data-testid="filter-detail">
    <SubSection title="JOKER-KO를 함께 사용하면?" />
    <p>{legacy ? "ML 검사 기록 없음 — 과거 진단은 자동 재검사하지 않습니다."
      : noTargets ? "보강 후 잔여 유출이 없어 추가 검사 대상이 없습니다."
      : complete ? `지시문 보강 후에도 유출을 일으킨 공격 ${fr.residual}건을 추가로 검사했습니다.`
      : "ML 검사를 완료하지 못했습니다. 규칙 검사 결과만 제공합니다."}</p>
    {fr ? <StatRow items={[
      { label: "보강 후 남은 유출", value: `${fr.residual}건`, sub: "R2 확정 유출" },
      { label: "규칙으로 탐지", value: `${fr.rule_blockable}건`, sub: "난독화 규칙" },
      { label: "JOKER-KO가 추가 탐지", value: complete ? count(fr.ml_additional) : "미검사", sub: "규칙 탐지와 중복 제외" },
      { label: "둘 다 탐지하지 못함", value: complete ? count(fr.undetected) : "미검사", sub: "검사 완료 항목 기준" },
    ]} /> : null}
    {complete ? <p>{fr.note}</p> : null}
    {fr && !legacy && !noTargets ? <p className="fine">ML 검사 완료 {fr.checked ?? 0}건 · 미검사 {fr.unchecked ?? fr.residual}건 · 모델 {fr.model} · 임계값 {fr.threshold ?? "확인 불가"}</p> : null}
    {fr && Object.keys(fr.flags ?? {}).length ? <p>규칙 탐지 근거: {Object.entries(fr.flags).map(([k, v]) => <span className="pill" key={k}>{FLAG_KO[k] ?? k} · {v}건</span>)}</p> : null}
    <p className="fine">이번 진단 공격문을 사후 검사한 결과입니다. 운영 서비스에 필터가 적용된 상태는 아닙니다. 기존 ASR·등급과 별개이며 일반적인 정확도나 운영 방어율을 뜻하지 않습니다.</p>
  </div>;
}
