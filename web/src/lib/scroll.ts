// 해시 앵커로 이동. ★ 화면의 모든 '섹션으로 가기' 는 여기 한 곳을 지난다.
//
// ★ scrollIntoView 를 쓰지 않는다 (2026-09-15).
//   product.css 의 html { scroll-behavior:smooth } 때문에 scrollIntoView 는 애니메이션으로
//   돌고, 그 사이 ScrollStory 의 등장 효과와 레이아웃 확정이 끼어들어 스크롤이 중간에 끊겼다.
//   실측: /diagnose#start 는 목적지가 1455px 인데 0px(상단바 CTA) · 146px(히어로 CTA) 에서
//   멈췄다 — 진단 시작 버튼 세 개가 전부 입력 폼에 닿지 못했다.
//   위치를 직접 재서 한 번에 이동하면 끊길 구간 자체가 없다.

/** 문서 기준 세로 위치. sticky 요소는 getBoundingClientRect 가 '붙어 있는 자리' 를 주므로 못 쓴다. */
export function documentTop(el: HTMLElement): number {
  let y = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    y += node.offsetTop;
  }
  return y;
}

function px(value: string | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * id 에 해당하는 요소가 놓일 스크롤 위치. 요소가 없으면 null.
 *
 * 내려갈 자리는 CSS 가 정한 값(scroll-padding-top + 해당 요소의 scroll-margin-top)을 그대로
 * 읽는다 — 숫자를 코드에 박으면 디자인을 바꿀 때 화면과 조용히 어긋난다.
 */
export function anchorTarget(id: string): number | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const pad = px(getComputedStyle(document.documentElement).scrollPaddingTop);
  const margin = px(getComputedStyle(el).scrollMarginTop);
  return Math.max(0, documentTop(el) - pad - margin);
}

/**
 * 목적지가 자리를 잡을 때까지 몇 프레임 따라가며 이동한다. 반환값은 중단 함수.
 *
 * ★ 한 프레임만 보면 안 된다 (2026-09-15 실측): 라우트가 막 바뀐 시점에는 요소가 이미
 *   존재하는데도 문서 높이가 확정되지 않아 목적지가 0 에 가깝게 계산된다. 그래서 '요소를
 *   찾았는가' 가 아니라 **'목적지 값이 더 이상 변하지 않는가'** 를 기준으로 삼는다.
 * ★ 값이 바뀔 때만 다시 이동한다 — 자리가 잡힌 뒤에는 아무 것도 하지 않으므로, 그 사이
 *   사용자가 직접 스크롤을 시작해도 화면을 도로 끌어당기지 않는다.
 */
export function settleToAnchor(id: string, frames = 8): () => void {
  let raf = 0;
  let left = frames;
  let last: number | null = null;
  const step = () => {
    raf = 0;
    const target = anchorTarget(id);
    if (target !== null && target !== last) {
      scrollToY(target);
      last = target;
    }
    if (left-- > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { left = 0; if (raf) cancelAnimationFrame(raf); };
}

/** 즉시 이동(부드러운 스크롤을 명시적으로 끈다). 음수·과다 값은 브라우저가 잘라준다. */
export function scrollToY(top: number): void {
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
}

/**
 * 고정 상단바 바로 아래에 오도록 이동. sticky 요소(리포트 탭바)를 목적지로 삼을 때 쓴다.
 *
 * ★ sticky 요소에 scrollIntoView 를 걸면 '이미 붙어 있는 자리' 를 기준으로 계산해서,
 *   탭을 눌렀을 때 패널 첫 제목이 탭바 뒤에 숨었다(실측: 제목 y=132, 탭바 88~173).
 */
export function scrollUnderTopbar(el: HTMLElement): void {
  const bar = document.querySelector<HTMLElement>(".topbar");
  scrollToY(documentTop(el) - (bar ? bar.getBoundingClientRect().height : 0));
}
