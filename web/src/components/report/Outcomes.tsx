// 결과가 '리포트' 가 아닌 두 경우 — 진단 불가(inconclusive) · 실패(error).
// ★ 진단 불가에는 등급·공격 성공률을 절대 그리지 않는다. 실행하지 않은 진단에 좋은 점수를 주면
//   그게 제일 위험한 거짓말이다(tests: Inconclusive 에 등급이 없다).
// ★ 실패 코드는 api/jobs.classify_error 가 정한다 — 화면과 서버가 같은 어휘를 쓴다.
import type { Run } from "../../api/types";
import { SCOPE_NOTICE } from "../../lib/advice";
import { Failure } from "../States";

export function Inconclusive({ run }: { run: Run }) {
  return (
    <>
      <p className="fine">{SCOPE_NOTICE}</p>
      <Failure icon="🔍" title="진단 불가 — 보호할 비밀값이 없습니다" runId={run.run_id} tone="warn"
        why={<>{run.report?.reason || "규칙에서 비공개로 지킬 값을 찾지 못했습니다."}<br />
          <b>이 결과는 ‘안전함’ 을 뜻하지 않습니다.</b> 유출 시험을 실행하지 않아 등급을 매기지 않았습니다.</>}
        actions={[
          <>예시 지시문으로 다시 검사하거나, <b>테스트용 가짜 코드</b>와 비공개 규칙을 넣어 보세요. 실제 비밀값은 넣지 마세요.</>,
          <><b>＋ 새 진단</b> 으로 다시 시도 — 진단 불가는 무료 체험 1회를 쓰지 않습니다</>,
        ]} />
    </>
  );
}

export function RunError({ run }: { run: Run }) {
  const code = run.error?.code;
  if (code === "target_unreachable") {
    return (
      <Failure icon="🔌" title="대상 모델에 연결하지 못했습니다" code={code} runId={run.run_id}
        why={<>선택한 AI 모델에 연결할 수 없어 검사를 완료하지 못했습니다.</>}
        actions={[
          <>내 API 키를 사용한다면 <b>고급 설정</b>에서 API 주소 · 모델명 · 키를 확인</>,
          "기본 모델을 사용 중이라면 잠시 후 다시 시도",
          <>확인 후 <b>＋ 새 진단</b> 으로 다시 시도 — 결과를 못 받았으므로 무료 체험 1회는 그대로 남아 있습니다</>,
        ]} />
    );
  }
  if (code === "budget_exceeded") {
    return (
      <Failure icon="🛑" title="검사 한도에 도달해 중단했습니다" code={code} runId={run.run_id} tone="warn"
        why={<>과도한 AI 사용을 막기 위해 중단했습니다. <b>중단 시점까지의 결과는 저장되지 않았습니다.</b></>}
        actions={[
          <><b>고급 설정</b>에서 <b>빠른 검사</b>로 변경해 다시 시도</>,
          "계속되면 서비스 담당자에게 문의",
        ]} />
    );
  }
  return (
    <Failure icon="⚠️" title="진단 중 오류가 발생했습니다" code={code} runId={run.run_id}
      why="검사를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."
      actions={[<><b>＋ 새 진단</b>으로 다시 시도</>, "계속되면 진단 번호와 오류 코드를 서비스 담당자에게 전달"]} />
  );
}
