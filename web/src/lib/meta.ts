// 상태·색 정의의 단일 출처(ui/streamlit_app.py 의 FINDING_META·GRADE_COLOR 를 옮김).
// ★ 색을 화면마다 따로 쓰면 같은 위험이 다른 위험처럼 보인다.
import type { FindingState } from "../api/types";

export const GRADE_COLOR: Record<string, string> = {
  A: "#187B59", B: "#285DDD", C: "#956000", D: "#AC541F", F: "#B5364E",
};

export const FINDING_META: Record<FindingState, { name: string; color: string; desc: string }> = {
  unjudged: { name: "판정 불가", color: "#956000", desc: "응답 또는 판정이 불완전하여 재검증이 필요합니다" },
  unresolved: { name: "미해결", color: "#B5364E", desc: "보강 전후 모두 유출이 관측됐습니다" },
  regressed: { name: "보강 후 신규", color: "#956000", desc: "보강 전에는 막혔는데 보강 후 뚫렸습니다" },
  resolved: { name: "해결됨", color: "#187B59", desc: "보강 전에는 유출, 보강 후에는 미검출입니다" },
  unaffected: { name: "기존부터 차단됨", color: "#5C6C83", desc: "보강 전부터 차단돼 있었습니다" },
  no_retry: { name: "재진단 없음", color: "#66758C", desc: "같은 공격이 2회차에 실행되지 않았습니다" },
};

export const sev = (state: FindingState) => FINDING_META[state].color;
