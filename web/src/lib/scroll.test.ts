// 해시 앵커 이동 (2026-09-15).
//
// 무엇을 지키나: /diagnose#start 같은 링크가 **실제로 그 자리로 간다**.
// 예전에는 scrollIntoView + scroll-behavior:smooth 가 등장 애니메이션과 부딪혀 0~146px 에서
// 끊겼고, 진단 시작 버튼 세 개가 전부 입력 폼에 닿지 못했다.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { anchorTarget, documentTop, scrollToY, scrollUnderTopbar, settleToAnchor } from "./scroll";

/** jsdom 은 레이아웃을 계산하지 않는다 — offsetTop 을 직접 심어 '문서 위치' 를 만든다. */
function placeSection(id: string, offsetTop: number, scrollMarginTop = "20px") {
  const el = document.createElement("div");
  el.id = id;
  el.style.scrollMarginTop = scrollMarginTop;
  Object.defineProperty(el, "offsetTop", { configurable: true, get: () => offsetTop });
  Object.defineProperty(el, "offsetParent", { configurable: true, get: () => null });
  document.body.appendChild(el);
  return el;
}

let scrolled: { top: number; behavior?: string }[] = [];
// rAF 대역. ★ 취소가 실제로 동작해야 한다 — no-op 으로 두면 cancelAnimationFrame 을 안 부르는
//   구현도 테스트를 통과해버린다(브라우저에서는 그 사이 화면이 한 번 튄다).
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

beforeEach(() => {
  scrolled = [];
  frames = new Map();
  nextFrameId = 0;
  document.documentElement.style.scrollPaddingTop = "110px";
  vi.stubGlobal("scrollTo", (o: { top: number; behavior?: string }) => { scrolled.push(o); });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++nextFrameId, cb);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
});
// ★ innerHTML 대입을 쓰지 않는다 — tests/test_web_guard.py 가 금지한다(테스트도 예외 없음).
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

const tick = (n = 1) => {
  for (let i = 0; i < n; i++) {
    const run = [...frames.values()];
    frames = new Map();
    run.forEach((cb) => cb(0));
  }
};

it("문서 위치는 offsetParent 사슬을 모두 더한다", () => {
  const el = placeSection("start", 700);
  expect(documentTop(el)).toBe(700);
});

it("목적지는 CSS 가 정한 값(scroll-padding-top + scroll-margin-top)을 그대로 뺀다", () => {
  placeSection("start", 1563);
  // 1563 - 110(padding) - 20(margin) = 1433 — 실제 /diagnose#start 의 목적지와 같다
  expect(anchorTarget("start")).toBe(1433);
  expect(anchorTarget("없는-섹션")).toBeNull();
});

it("목적지를 넘어가지 않게 0 아래로는 내려가지 않는다", () => {
  placeSection("top", 50);
  expect(anchorTarget("top")).toBe(0);
});

it("부드러운 스크롤을 명시적으로 끈다 — 애니메이션이 중간에 끊기던 원인", () => {
  scrollToY(742);
  expect(scrolled).toEqual([{ top: 742, behavior: "instant" }]);
});

it("★ 한 프레임만 보지 않는다 — 문서 높이가 늦게 확정돼도 결국 제자리로 간다", () => {
  // 라우트가 막 바뀐 시점: 아직 레이아웃이 안 잡혀 목적지가 0 에 가깝게 계산된다.
  let offset = 40;
  const el = placeSection("start", 0);
  Object.defineProperty(el, "offsetTop", { configurable: true, get: () => offset });

  settleToAnchor("start");
  tick();                                   // 첫 프레임 — 잘못된 자리로 간다
  expect(scrolled[scrolled.length - 1].top).toBe(0);

  offset = 1563;                            // 레이아웃 확정
  tick();
  expect(scrolled[scrolled.length - 1].top).toBe(1433);  // 따라잡는다
});

it("자리가 잡힌 뒤에는 다시 스크롤하지 않는다 — 사용자가 직접 움직여도 끌어당기지 않는다", () => {
  placeSection("start", 1563);
  settleToAnchor("start");
  tick(6);
  expect(scrolled).toEqual([{ top: 1433, behavior: "instant" }]);   // 딱 한 번
});

it("중단 함수를 부르면 더 이상 따라가지 않는다(라우트가 또 바뀐 경우)", () => {
  placeSection("start", 1563);
  const stop = settleToAnchor("start");
  stop();
  tick(4);
  expect(scrolled).toEqual([]);
});

it("sticky 요소는 상단바 높이만큼만 올린다 — 리포트 탭바 뒤에 제목이 숨던 문제", () => {
  // 탭바가 sticky(top:88) 라 scrollIntoView 는 '이미 붙어 있는 자리' 로 계산해 제목을 가렸다.
  const bar = document.createElement("header");
  bar.className = "topbar";
  bar.getBoundingClientRect = () => ({ height: 88 }) as DOMRect;
  document.body.appendChild(bar);

  const nav = placeSection("report-navigation", 405, "0px");
  scrollUnderTopbar(nav);
  // 405 - 88 → 탭바는 제 sticky 자리(88)에 붙고, 그 아래부터 패널 내용이 시작된다.
  expect(scrolled).toEqual([{ top: 317, behavior: "instant" }]);
});

it("상단바를 못 찾아도 죽지 않는다(문서 위치로 이동)", () => {
  const nav = placeSection("report-navigation", 405, "0px");
  scrollUnderTopbar(nav);
  expect(scrolled).toEqual([{ top: 405, behavior: "instant" }]);
});
