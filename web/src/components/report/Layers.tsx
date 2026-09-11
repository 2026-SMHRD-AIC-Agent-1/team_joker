// 진단 엔진 ↔ JOKER-KO 탐지기. **코드의 실제 관계** 를 그린다.
//
// ★ 요청 흐름(입력 → 탐지기 → 모델)을 그리면 안 된다 — 그건 고객이 배치할 목표 모습이지 우리 코드가 아니다.
//   진단 파이프라인은 KoDetector 를 부르지 않고, 유일한 접점인 filter_recommendation 은 남은 유출 문구에
//   난독화 **규칙만** 사후로 대 보는 계산이다(basis = rule_layer_only). 두 기능은 병렬이고 잇는 것은 권고다.
// ★ 여기 숫자는 filter_recommendation 이 준 값이거나 그 뺄셈, 그리고 headline_metrics.json 뿐이다.
import { useNavigate } from "react-router-dom";
import type { Report } from "../../api/types";
import { metric } from "../../evidence/metrics";
import { useHealth } from "../../hooks/useHealth";
import { DETECTOR_DEMO_TEXT } from "../../lib/examples";
import type { DetectPrefill } from "../../lib/examples";
import { residualSample } from "../../lib/findings";
import { sev } from "../../lib/meta";
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
  return (
    <div className="ladder" data-testid="ladder">
      <div className="lad-h">같은 공격 50건에 방어 구성 네 가지 — <b>이 진단이 아니라 검증 데이터</b> ({m.condition})</div>
      <div className="lad-row">
        {steps.map((x, i) => (
          <div className={`lad-c${i === steps.length - 1 ? " lad-best" : ""}`} key={x.label}>
            <span className="lad-l">{x.label}</span><b className="num">{x.value}</b><span className="lad-d">{x.detail}</span>
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
          <span className="d">지시문에 한국어 공격을 실제로 던져 뚫리는 곳을 찾고, 모델이 잘 거절하도록 지시문을 고칩니다.</span></div>
        <div className="rel-link"><span>결과가<br />배치 근거</span><i>▶</i></div>
        <div className="rel-box todo"><span className="tag">아직 배치 전</span><b>JOKER-KO 탐지기</b>
          <span className="d">고객 챗봇의 입력단에 답니다. 요청이 모델에 닿기 전에 한국어 프롬프트 인젝션인지 판정해 잘라냅니다.</span></div>
      </div>
      <Ladder />
      <div className="layers-note in-card"><b>두 기능은 서로를 호출하지 않습니다.</b> 진단이 찾아낸 결과가 탐지기를 배치할 근거가 됩니다.{" "}
        {residual ? <>이번 진단에서 지시문 보강만으로 막지 못한 <b>{residual}건</b>이, 탐지기를 배치할 근거입니다.</>
          : "이번 진단에서는 남은 유출이 없었습니다. 다만 새로운 우회 시도는 계속 나오므로, 탐지기는 그때 먼저 걸러 주는 2차 방어로 함께 배치하기를 권고합니다."}
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
      <div><b>입력단에 JOKER-KO 탐지기를 배치하세요</b><p>{note}</p></div></div>
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
        {sample ? "보강 후에도 뚫린 공격 문구 1건을 탐지 화면에 넣어 둡니다 — 지시문 보강이 놓친 그 요청을 탐지기가 잡는지 그 자리에서 확인할 수 있습니다."
          : !fr.residual ? <>남은 유출이 없어 넘길 문구가 없습니다. 대신 <b>난독화 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아니라 화면이 넣어 준 고정 문장입니다.</>
          : <>남은 공격 문구는 회원 리포트에서만 넘겨받습니다. 대신 <b>난독화 예시</b>를 넣어 둡니다 — 이 진단의 결과가 아닌 고정 문장입니다.</>}
        {h && !h.detector_ready ? " ※ 이 PC 에는 탐지 모델이 없어 화면에 안내가 뜹니다." : null}
      </div>
    </div>
  );
}

/** 탐지기 배치 권고의 상세 수치. 요약·권고 문장은 위(관계도·권고 1번)가 맡는다. */
export function FilterLayerDetail({ rep }: { rep: Report }) {
  const fr = rep.filter_recommendation;
  if (!fr?.note) return null;
  const residual = fr.residual ?? 0;
  const blockable = fr.rule_blockable ?? 0;
  const mlOnly = Math.max(residual - blockable, 0);
  const flags = Object.entries(fr.flags ?? {});
  const detail = ["detector_f1", "ood_recall", "fpr", "defense_matrix"].map(metric);
  return (
    <>
      <SubSection title="JOKER-KO 탐지기 — 이 진단에서 나온 근거 수치" />
      <div className="risk" style={{ marginTop: 0 }}>
        <b>지시문 보강안</b>은 모델이 잘 거절하도록 지시문을 고치는 방식입니다. <b>JOKER-KO 탐지기</b>는 그 요청이 모델에 닿기 전에
        잘라내는 층입니다 — 사용자가 보낸 문구를 챗봇에 넘기기 전에 한국어 프롬프트 인젝션인지 판정하고, 공격이면 챗봇을 아예
        호출하지 않습니다. <b>모델이 어떻게 답하든 결과가 같다</b>는 점이 보강안과 다릅니다.
      </div>
      <div className="notice" style={{ margin: "16px 0" }}>{fr.note}</div>
      <StatRow items={[
        { label: "보강 후 남은 유출", value: `${residual}건`, sub: "지시문 보강만으로는 막지 못한 공격",
          color: residual ? sev("unresolved") : sev("resolved") },
        { label: "규칙 층만으로 차단 가능", value: `${blockable}건`, sub: "난독화 시그니처에 걸리는 건",
          color: blockable ? sev("resolved") : undefined },
        { label: "ML 층 판단이 필요", value: `${mlOnly}건`, sub: "추가 검증이 필요한 요청" },
      ]} />
      {flags.length ? (
        <div style={{ marginTop: 14 }}>규칙이 잡는 사유{" "}
          {flags.map(([k, v]) => <span className="pill" key={k}>{FLAG_KO[k] ?? k} · {v}건</span>)}</div>
      ) : null}
      {/* ★ basis=rule_layer_only — 규칙 층만 돌려 센 값이라 하한이다. 이 단서를 빼면 과소보고가 된다. */}
      <p className="fine">※ 가운데·오른쪽 수치는 <b>규칙 층만</b> 돌려 센 값입니다(<code>basis = {fr.basis || "rule_layer_only"}</code>).
        ML 층은 평가하지 않았습니다. 실제 통합 효과와 정상 질문 오탐률은 별도로 확인하세요.</p>
      <details className="xp" style={{ marginTop: 12 }}>
        <summary>이 층이 어떻게 판정하나 — ML + 난독화 규칙 2중 방어</summary>
        <div className="xp-body">
          <p><b>ML 층 · JOKER-KO</b> — Prompt Guard 2 를 한국어 공격 문구로 파인튜닝한 분류 모델입니다. 문구 하나를 받아 ‘공격일 확률’ 을
            내고, 임계값을 넘으면 INJECTION 으로 판정합니다.</p>
          <p style={{ marginTop: 8 }}><b>규칙 층 · 난독화 시그니처</b> — 문자 변형 등 정해진 패턴을 검사합니다(거꾸로 뒤집기 · 자모 분해 ·
            글자 사이 구분자 · base64 · 로마자 음차). 학습을 하지 않는 순수 함수라 학습셋과 무관합니다 — 그래서 순환 평가 위험이 없습니다.</p>
          <p style={{ marginTop: 8 }}><b>두 층의 관계</b> — 둘 중 <b>하나만 걸려도 차단</b>합니다. JOKER-KO 탐지기 화면에서 그 장면을 직접
            만들어 볼 수 있습니다(예시 버튼 중 ‘문자 변형 요청’).</p>
          {detail.map((x) => x ? (
            <p className="fine" key={x.key}>· {x.label} <b>{x.value}</b> — {x.detail} (측정 조건 · {x.condition})</p>
          ) : null)}
          <p className="fine">이 진단의 수치가 아니라 <b>이 층 자체의 검증 수치</b>입니다. 지금 진단한 지시문과는 다른 데이터로 측정했습니다.</p>
        </div>
      </details>
      <p className="fine">이 층을 직접 시험해 보는 버튼은 위 <b>권고 조치 1번</b> 옆에 있습니다.</p>
    </>
  );
}
