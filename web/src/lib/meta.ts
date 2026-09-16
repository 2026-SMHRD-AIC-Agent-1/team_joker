// 상태·색 정의의 단일 출처(ui/streamlit_app.py 의 FINDING_META·GRADE_COLOR 를 옮김).
// ★ 색을 화면마다 따로 쓰면 같은 위험이 다른 위험처럼 보인다.
//
// ★ 밝은 테마용 값이다(2026-09-15). 어두운 테마의 파스텔을 그대로 가져오면 안 된다 —
//   예전 '해결됨' 민트 #6BD8AD 는 흰 배경에서 대비 1.6:1 이라 사실상 안 보였다.
//   여기 값은 전부 흰 배경(#FFFFFF)·페이지 배경(#F7F8FB) 기준 4.5:1 이상으로 확인했다.
//   등급 칩처럼 이 색을 '바탕' 으로 쓰는 자리는 글자를 흰색으로 둔다(대비 5:1 이상).
import type { FindingState } from "../api/types";

/** 상태색이 아닌 중립 회색. 표·차트의 '값 없음/변화 없음' 자리에 쓴다. */
export const NEUTRAL = "#646E82";

export const GRADE_COLOR: Record<string, string> = {
  A: "#0A7A53", B: "#2F55CC", C: "#9A5B00", D: "#C2410C", F: "#C62A41",
};

export const FINDING_META: Record<FindingState, { name: string; color: string; desc: string }> = {
  unjudged: { name: "판정 불가", color: "#9A5B00", desc: "응답 또는 판정이 불완전하여 재검증이 필요합니다" },
  unresolved: { name: "유출 남음", color: "#C62A41", desc: "수정 전후 모두 정보가 노출됐습니다" },
  regressed: { name: "수정 후 새 유출", color: "#9A5B00", desc: "수정 전에는 막았지만 수정 후 정보가 노출됐습니다" },
  resolved: { name: "수정 후 차단", color: "#0A7A53", desc: "수정 전에는 노출됐지만 이번 재시험에서는 차단됐습니다" },
  unaffected: { name: "처음부터 차단", color: "#646E82", desc: "수정 전부터 차단돼 있었습니다" },
  // ★ 밝기가 아니라 색상(hue)으로 unaffected 와 구분한다. 두 중립색을 밝기로만 가르면
  //   둘 중 하나는 4.5:1 을 못 넘거나, 넘더라도 도넛 차트에서 같은 회색으로 보인다.
  no_retry: { name: "재시험 안 됨", color: "#5E6B8C", desc: "같은 공격이 2회차에 실행되지 않았습니다" },
};

export const sev = (state: FindingState) => FINDING_META[state].color;

/** 메시지 검사와 진단 결과에서 같은 탐지 사유를 같은 이름으로 표시한다. */
export const FLAG_KO: Record<string, string> = {
  역순요청: "거꾸로 출력 요구", 자모분해요청: "자모·초성 분해 요구", 자모분해: "자모가 분해된 문자열",
  구분자삽입: "글자 사이 구분자 삽입", 인코딩요청: "문자를 코드로 바꿔 출력 요구", 로마자음차: "한글을 영문 발음으로 출력 요구",
};

/**
 * 판정(verdict) 색 — 유출/차단/판정불가.
 * ★ 화면마다 따로 쓰던 것을 여기로 모았다(0915). Evidence·Detect 가 각자 hex 를 들고 있어
 *   테마를 바꿀 때 한 화면만 빠지면 '같은 유출이 다른 색' 이 된다.
 */
export const VERDICT_COLOR = {
  leak: FINDING_META.unresolved.color,
  block: FINDING_META.resolved.color,
  gray: FINDING_META.unjudged.color,
} as const;

export const verdictColor = (verdict: string): string =>
  verdict === "leak" ? VERDICT_COLOR.leak : verdict === "block" ? VERDICT_COLOR.block : VERDICT_COLOR.gray;
