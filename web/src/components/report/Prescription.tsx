// 규칙 수정안 — 지시문 수정안 · 원본 대비 변경 · 탐지기 상세 수치.
// ★ 게이팅 경계: 등급·전후 건수·변화량·상태별 건수는 전부 무료 공개다. 여기부터가 '해결책' 이라
//   비회원에게는 서버가 수정안 앞 2줄만 내려준다(원본 지시문은 아예 안 담긴다).
import type { Gated, Report } from "../../api/types";
import { metric } from "../../evidence/metrics";
import { diffLines } from "../../lib/diff";
import { CopyButton } from "../CopyButton";
import { Section, SubSection } from "../Section";
import { Gate } from "./Gate";
import { FilterLayerDetail } from "./Layers";
import { FINDING_META, NEUTRAL } from "../../lib/meta";

function DiffView({ rep, gated }: { rep: Report; gated: Gated }) {
  const original = rep.original_prompt;
  const patched = rep.patched_prompt ?? "";
  return (
    <>
      {/* ★ 줄 단위 비교는 펼쳐 두면 화면의 절반을 먹는다 — 접고, 마스킹 경고만 밖에 남긴다(0914). */}
      {gated.is_gated ? (
        // ★ 같은 잠금 CTA 를 한 화면에 여러 번 반복하지 않는다. 무엇이 잠겼는지만 한 줄로.
        <div className="notice">🔒 원본 지시문과 수정안을 줄 단위로 비교하는 화면입니다. <b>무료 가입</b> 후 변경된 내용을 확인할 수 있습니다.</div>
      ) : !original ? (
        // ★ 데이터를 지어내지 않는다. 원본이 없으면 없다고 말한다.
        <div className="notice">이 진단에는 원본 지시문이 저장돼 있지 않아 변경 비교를 만들 수 없습니다(이전 버전에서 저장된 진단).
          위 수정안은 검토할 수 있습니다.</div>
      ) : (
        <>
          <details className="xp"><summary>원본 · 수정안 줄 단위 비교</summary><div className="xp-body">
          <div className="diff-legend">
            <span><b style={{ color: FINDING_META.resolved.color }}>＋</b> 수정안에 추가된 줄</span>
            <span><b style={{ color: FINDING_META.unresolved.color }}>−</b> 원본에서 빠진 줄</span>
            <span><b style={{ color: NEUTRAL }}>=</b> 그대로 유지된 줄</span>
          </div>
          <div className="diff" data-testid="diff">
            {diffLines(original, patched).map((r, i) => (
              <div className={`r ${r.cls}`} key={i}><span className="mk">{r.mk}</span><span>{r.text || " "}</span></div>
            ))}
          </div>
          </div></details>
          {/* ★ 마스킹 고지. 말하지 않으면 사용자가 마스킹된 문자열을 그대로 운영에 붙여 넣는다. */}
          {original.includes("[REDACTED]") ? (
            <div className="alert alert-warn" style={{ marginTop: 12 }}>⚠️ 위 원본에서 <b>비밀값은 [REDACTED] 로 마스킹</b>돼 있습니다.
              이 사본으로 원문을 <b>복원할 수 없습니다.</b> 이 비교는 ‘무엇이 바뀌었나’ 를 보는 용도이며, 마스킹된 줄을 그대로 운영에
              적용하면 안 됩니다 — 실제 비밀값은 서버의 인증·권한 관리로 옮기세요.</div>
          ) : (
            <p className="fine">※ 원본은 비밀값이 마스킹된 사본입니다 — 적용 전에 실제 값을 직접 확인하세요.</p>
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
      <Section title="규칙 수정안" desc="추가된 규칙을 검토한 뒤 내 챗봇 설정에 반영하세요." />
      {/* ★ 0911 D: '정상 질문으로 재검증' 권고를 맨 위로. 수치는 headline_metrics.json 에서만. */}
      <div className="notice" style={{ marginBottom: 12 }} data-testid="recheck">
        {/* ★ 아래 문장은 tests/test_web_guard.py 의 정직성 목록에 있다 — 한 줄로 둔다(줄바꿈하면 검사가 못 찾는다). */}
        <b>적용 전에 별도 공격과 정상 질문으로 재검증하세요.</b> 같은 공격의 개선만으로 일반화하지 마세요. 정상 업무까지 거절하지 않는지도 확인해야 합니다.
        {/* ★ 경고 문장은 줄이지 않는다. 부연(bp.detail)만 뺀다 — 같은 내용이 '검증 근거' 에 조건까지 함께 있다. */}
        {bp ? <><br />별도 시험에서 규칙을 추가한 뒤 일반 질문 응답률이 <b>{bp.value}</b>로 바뀌었습니다.</> : null}
      </div>
      {rep.applied_patterns?.length ? (
        <>
          <div>추가된 보호 규칙 {rep.applied_patterns.map((p) => <span className="pill pill-b" key={p}>{p}</span>)}</div>
          {/* ★ 어느 패턴이 어느 공격을 막았는지는 저장하지 않는다 → 인과를 단정하지 않는다. */}
          <p className="fine">수정안 전체를 함께 시험한 결과입니다. 규칙 하나만의 효과는 알 수 없습니다.</p>
        </>
      ) : null}
      <SubSection title="챗봇에 적용할 규칙" />
      <div className="alert alert-warn">이 사본은 비공개 정보가 가려져 있습니다. 전체를 운영 설정에 그대로 덮어쓰지 마세요. 실제 비밀값은
        지시문 밖으로 옮기고, 추가 규칙을 검토해 적용하세요.</div>
      {/* 비회원은 앞 2줄뿐이라 '전문 복사' 버튼을 주지 않는다(전문이 아닌 것을 전문이라 부르지 않는다). */}
      {!gated.is_gated ? <CopyButton text={patched} label="수정안 전체 복사" /> : null}
      <pre className="patched" data-testid="patched">{patched}</pre>
      {gated.is_gated && hidden ? (
        <Gate title="수정안 전문" total={`${gated.patched_prompt_total_lines ?? 0}줄`} hidden={`${hidden}줄`}
          unlock={gated.unlock} onSignup={onSignup} />
      ) : null}
      <DiffView rep={rep} gated={gated} />
      <FilterLayerDetail rep={rep} />
    </>
  );
}
