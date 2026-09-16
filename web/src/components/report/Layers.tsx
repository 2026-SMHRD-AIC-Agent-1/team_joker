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
import { FLAG_KO } from "../../lib/meta";

/**
 * 관계도 아래 칸 — 같은 공격 50건 × 방어 구성 4개(검증 데이터).
 * ★ 네 칸을 전부 그린다. '탐지기만' 칸이 '수정만' 보다 낮은데 하나를 빼면 사다리처럼 읽혀 과장이 된다.
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
      <div className="lad-h">방어 방법별 정보 유출 비율 · 낮을수록 좋음 — <b>별도 시험 50건</b></div>
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
        <div className="rel-box done"><span className="tag">이번에 시험한 것</span><b>규칙 검사</b>
          <span className="d">정보가 새는지 시험하고, 수정안을 만듭니다.</span></div>
        <div className="rel-link"><span>남은 공격<br />추가 검사</span><i>▶</i></div>
        <div className="rel-box todo"><span className="tag">추가 탐지 확인</span><b>메시지 검사</b>
          <span className="d">AI와 규칙이 남은 공격을 찾아내는지 확인합니다.</span></div>
      </div>
      <Ladder />
      <div className="layers-note in-card"><b>수정 후 남은 공격도 추가로 검사합니다.</b>{" "}
        {residual ? <>수정 후 남은 <b>{residual}건</b>의 실제 검사 상태는 아래 결과에서 확인하세요.</>
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
      <div><b>남은 공격의 검사 결과를 확인하세요</b><p>{note}</p></div></div>
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
        {sample ? "이 메시지 검사하기 →" : "예시 메시지 검사하기 →"}
      </button>
      <div className="layers-note" style={{ margin: 0 }}>
        {sample ? "수정 후에도 정보를 노출시킨 메시지를 가져옵니다."
          : !fr.residual ? <>남은 유출이 없어 <b>글자 변형 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아닌 고정 문장입니다.</>
          : <>남은 문구는 회원 리포트에서만 넘겨받습니다. 대신 <b>글자 변형 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아닌 고정 문장입니다.</>}
        {h && !h.detector_ready ? " ※ 지금은 메시지 검사를 사용할 수 없습니다." : null}
      </div>
    </div>
  );
}

/** 저장된 수치만 표시한다. 미실행은 0건으로 대체하지 않는다. */
/** 사후 검사 수치를 탐지 성능으로 읽지 않게 하는 단서 + 처음 보는 공격 기준의 검증 수치. */
function TrainingOverlapNotice() {
  const ood = metric("ood_recall");
  const fpr = metric("fpr");
  return <div className="notice" data-testid="training-overlap" role="note">
    <b>이 수치는 탐지 성능 지표가 아닙니다.</b>{" "}
    검사한 공격문은 JOKER-KO 학습에 쓰인 공격 시드에서 만들어져, 모델이 이미 본 문장이 섞여 있습니다.
    {ood ? <> 처음 보는 공격에 대한 성능은 {ood.condition} 기준 <b>{ood.value}</b>({ood.detail})
      {fpr ? <>, 정상 문장 오탐 <b>{fpr.value}</b></> : null}입니다.</> : null}
  </div>;
}

export function FilterLayerDetail({ rep }: { rep: Report }) {
  const fr = rep.filter_recommendation;
  const complete = fr?.status === "completed";
  const noTargets = fr?.status === "no_targets";
  const legacy = !fr?.status || fr.status === "not_recorded";
  const count = (n: number | null | undefined) => n == null ? "미검사" : `${n}건`;
  return <div data-testid="filter-detail">
    <SubSection title="남은 공격도 찾아낼 수 있나요?" />
    <p>{legacy ? "AI 검사 기록 없음 — 과거 진단은 자동 재검사하지 않습니다."
      : noTargets ? "수정 후 잔여 유출이 없어 추가 검사 대상이 없습니다."
      : complete ? `지시문 수정 후에도 유출을 일으킨 공격 ${fr.residual}건을 추가로 검사했습니다.`
      : "AI 검사를 완료하지 못했습니다. 규칙 검사 결과만 제공합니다."}</p>
    {fr ? <StatRow items={[
      { label: "수정 후 남은 유출", value: `${fr.residual}건`, sub: "수정 후 확인된 유출" },
      { label: "규칙으로 탐지", value: `${fr.rule_blockable}건`, sub: "글자 변형 등 패턴" },
      { label: "JOKER-KO가 추가 탐지", value: complete ? count(fr.ml_additional) : "미검사", sub: "규칙과 중복 제외 · 학습 공격 포함" },
      { label: "둘 다 탐지하지 못함", value: complete ? count(fr.undetected) : "미검사", sub: "검사 완료 항목 기준" },
    ]} /> : null}
    {complete ? <p>{fr.note}</p> : null}
    {/* ★ 순환 평가 단서. 검사 대상은 진단 공격 시드로 만든 문장이고, JOKER-KO 학습 데이터도 같은 시드에서
        만들었다(detector/build_dataset.py — 57개 중 47개가 학습·검증). 그래서 위 탐지 수는 모델이 이미 본
        문장에 대한 값이라 성능으로 읽히면 과장이 된다. 처음 보는 공격 기준 수치는 headline_metrics 에서만 가져온다. */}
    {complete && (fr.ml_additional ?? 0) > 0 ? <TrainingOverlapNotice /> : null}
    {fr && !legacy && !noTargets ? <p className="fine">AI 검사 완료 {fr.checked ?? 0}건 · 미검사 {fr.unchecked ?? fr.residual}건 · 모델 {fr.model} · 판단 기준값 {fr.threshold ?? "확인 불가"}</p> : null}
    {fr && Object.keys(fr.flags ?? {}).length ? <p>규칙 탐지 근거: {Object.entries(fr.flags).map(([k, v]) => <span className="pill" key={k}>{FLAG_KO[k] ?? k} · {v}건</span>)}</p> : null}
    <p className="fine">이번 진단 공격문을 사후 검사한 결과입니다. 운영 서비스에 필터가 적용된 상태는 아닙니다. 진단 등급과 별개이며, 일반적인 정확도나 실제 서비스의 방어율을 뜻하지 않습니다.</p>
  </div>;
}
