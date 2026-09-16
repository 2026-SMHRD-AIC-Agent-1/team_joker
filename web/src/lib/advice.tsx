// 상태별 권고. ★ 데이터에 없는 인과는 쓰지 않는다 — 특히 '어느 방어 패턴이 이 건을 막았는가' 는
// 저장하지 않으므로 단정하지 않는다. (ui/streamlit_app.py 의 ADVICE 를 그대로 옮김)
import type { ReactNode } from "react";
import type { FindingState } from "../api/types";
import { FINDING_META } from "./meta";

export const ADVICE: Record<FindingState, { color: string; title: string; body: ReactNode }> = {
  unjudged: { color: FINDING_META.unjudged.color, title: "판정 불가",
    body: "응답이나 판정 결과가 불완전합니다. 안전으로 해석하지 말고 재검증하세요." },
  unresolved: { color: FINDING_META.unresolved.color, title: "지시문 수정으로는 막히지 않았습니다",
    body: "이 공격은 수정안을 적용한 뒤에도 같은 방식으로 뚫렸습니다. 지시문 층에서 더 강한 문구를 추가하기 전에 "
      + "실제 비밀값을 지시문에서 제거하고 서버 권한 검사를 적용하세요. 입력 탐지기는 보조 방어이며 이 요청을 막는지는 "
      + "별도로 검증해야 합니다." },
  regressed: { color: FINDING_META.regressed.color, title: "수정 후에 새로 뚫렸습니다",
    body: <>수정 전에는 막히던 공격입니다. 수정안이 응답 방식을 바꾸면서 이 경로가 열렸을 수 있으므로{" "}
      <b>수정안을 그대로 적용하기 전에 이 건을 먼저 확인</b>하세요.</> },
  resolved: { color: FINDING_META.resolved.color, title: "수정안 적용으로 차단됐습니다",
    body: <>같은 공격을 수정 후에 다시 던졌을 때 차단됐습니다. 어느 방어 패턴이 막았는지는{" "}
      <b>저장하지 않으므로 단정하지 않습니다</b> — 수정안 전체를 기준으로 시험한 결과이며, 재실행 결과가 같다고
      보장하지는 않습니다.</> },
  unaffected: { color: FINDING_META.unaffected.color, title: "수정 전부터 차단돼 있었습니다",
    body: <>이 공격은 원래 지시문에서도 막혔습니다. 수정안을 적용해도 이 항목의 상태는 그대로입니다.{" "}
      <b>이 항목은 취약점이 아닙니다</b> — 테스트했고 통과한 건입니다.</> },
  no_retry: { color: FINDING_META.no_retry.color, title: "재진단이 실행되지 않았습니다",
    body: "2회차에 같은 공격이 실행되지 않아 수정 전후를 비교할 수 없습니다. 다시 진단하면 채워집니다." },
};

// 범위 고지 — fidelity 와 무관하게 항상 (BYOK 여도 '진짜 챗봇 진단' 이 아니다).
export const SCOPE_NOTICE = "챗봇의 규칙과 선택한 AI 모델을 시험한 결과입니다. 연결된 문서·외부 기능·이전 대화는 포함하지 않습니다.";
