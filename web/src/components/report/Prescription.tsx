// 보강안과 변경 내용 — 지시문 보강안 · 원본 대비 변경 · 탐지기 상세 수치.
// ★ 게이팅 경계: 등급·전후 건수·변화량·상태별 건수는 전부 무료 공개다. 여기부터가 '해결책' 이라
//   비회원에게는 서버가 보강안 앞 2줄만 내려준다(원본 지시문은 아예 안 담긴다).
import type { Gated, Report } from "../../api/types";
import { metric } from "../../evidence/metrics";
import { diffLines } from "../../lib/diff";
import { CopyButton } from "../CopyButton";
import { Section, SubSection } from "../Section";
import { Gate } from "./Gate";
import { FilterLayerDetail } from "./Layers";

function DiffView({ rep, gated }: { rep: Report; gated: Gated }) {
  const original = rep.original_prompt;
  const patched = rep.patched_prompt ?? "";
  return (
    <>
      <SubSection title="원본 · 보강안 변경 비교" />
      {gated.is_gated ? (
        // ★ 같은 잠금 CTA 를 한 화면에 여러 번 반복하지 않는다. 무엇이 잠겼는지만 한 줄로.
        <div className="notice">🔒 원본 지시문과 보강안을 줄 단위로 비교하는 화면입니다. 원본은 비회원 응답에 담기지 않으므로 비교를
          만들 수 없습니다 — <b>위의 무료 가입</b>을 마치면 이 자리에 변경 비교가 나타납니다.</div>
      ) : !original ? (
        // ★ 데이터를 지어내지 않는다. 원본이 없으면 없다고 말한다.
        <div className="notice">이 진단에는 원본 지시문이 저장돼 있지 않아 변경 비교를 만들 수 없습니다(이전 버전에서 저장된 진단).
          위 보강안 전문은 그대로 사용할 수 있습니다.</div>
      ) : (
        <>
          <div className="diff-legend">
            <span><b style={{ color: "#187B59" }}>＋</b> 보강안에 추가된 줄</span>
            <span><b style={{ color: "#B5364E" }}>−</b> 원본에서 빠진 줄</span>
            <span><b style={{ color: "#66758C" }}>=</b> 그대로 유지된 줄</span>
          </div>
          <div className="diff" data-testid="diff">
            {diffLines(original, patched).map((r, i) => (
              <div className={`r ${r.cls}`} key={i}><span className="mk">{r.mk}</span><span>{r.text || " "}</span></div>
            ))}
          </div>
          {/* ★ 마스킹 고지. 말하지 않으면 사용자가 마스킹된 문자열을 그대로 운영에 붙여 넣는다. */}
          {original.includes("[REDACTED]") ? (
            <div className="alert alert-warn" style={{ marginTop: 12 }}>⚠️ 위 원본에서 <b>비밀값은 [REDACTED] 로 마스킹</b>돼 있습니다.
              이 사본으로 원문을 <b>복원할 수 없습니다.</b> 이 비교는 ‘무엇이 바뀌었나’ 를 보는 용도이며, 마스킹된 줄을 그대로 운영에
              적용하면 안 됩니다 — 실제 비밀값은 서버의 인증·권한 관리로 옮기세요.</div>
          ) : (
            <p className="fine">※ 원본은 저장 시 비밀값 마스킹을 통과한 사본입니다. 마스킹된 값이 있으면 복원할 수 없으므로, 적용 전에 실제
              값을 직접 확인하세요.</p>
          )}
        </>
      )}
    </>
  );
}

export function Prescription({ rep, gated, onSignup }: { rep: Report; gated: Gated; onSignup: () => void }) {
  const bp = metric("benign_pass");
  const patched = rep.patched_prompt ?? "";
  const hidden = gated.patched_prompt_hidden_lines ?? 0;
  return (
    <>
      <Section title="보강안과 변경 내용" desc="두 가지입니다 — 지시문을 고치고, 입력단에 탐지기를 답니다." />
      {/* ★ 0911 D: '정상 질문으로 재검증' 권고를 맨 위로. 수치는 headline_metrics.json 에서만. */}
      <div className="notice" style={{ marginBottom: 12 }} data-testid="recheck">
        <b>적용 전에 별도 공격과 정상 질문으로 재검증하세요.</b> 같은 공격의 개선만으로 일반화하지 마세요. 정상 업무까지 거절하지
        않는지도 확인해야 합니다.
        {bp ? <><br />이 도구의 검증(별도 데이터)에서도 보강문을 붙이자 정상 업무 통과율이 <b>{bp.value}</b>로 바뀌었습니다 — {bp.detail}.</> : null}
      </div>
      {rep.applied_patterns?.length ? (
        <>
          <div>적용된 방어 패턴 {rep.applied_patterns.map((p) => <span className="pill pill-b" key={p}>{p}</span>)}</div>
          {/* ★ 어느 패턴이 어느 공격을 막았는지는 저장하지 않는다 → 인과를 단정하지 않는다. */}
          <p className="fine">※ 어느 패턴이 어떤 공격을 막았는지는 저장하지 않으므로 개별 인과는 표시하지 않습니다. 보강안은 전체를 함께
            적용해야 같은 결과가 나옵니다.</p>
        </>
      ) : null}
      <SubSection title="지시문 보강안 — 추가 규칙을 검토하세요" />
      <div className="alert alert-warn">이 사본은 보호값이 마스킹되어 있습니다. 전체를 운영 설정에 그대로 덮어쓰지 마세요. 실제 비밀값은
        지시문 밖으로 옮기고, 추가 규칙을 검토해 적용하세요.</div>
      {/* 비회원은 앞 2줄뿐이라 '전문 복사' 버튼을 주지 않는다(전문이 아닌 것을 전문이라 부르지 않는다). */}
      {!gated.is_gated ? <CopyButton text={patched} label="보강안 전문 복사" /> : null}
      <pre className="patched" data-testid="patched">{patched}</pre>
      {gated.is_gated && hidden ? (
        <Gate title="보강안 전문" total={`${gated.patched_prompt_total_lines ?? 0}줄`} hidden={`${hidden}줄`}
          unlock={gated.unlock} onSignup={onSignup} />
      ) : null}
      <DiffView rep={rep} gated={gated} />
      <FilterLayerDetail rep={rep} />
    </>
  );
}
