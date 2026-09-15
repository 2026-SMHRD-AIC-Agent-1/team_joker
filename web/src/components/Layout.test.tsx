// 화면 안 '#섹션' 링크는 라우터를 태운다 (2026-09-15).
//
// 왜 필요한가: <a href="#start"> 는 React Router 의 location 을 갱신하지 않아서 Layout 의
// 스크롤 효과가 아예 돌지 않았다. 브라우저의 부드러운 스크롤만 남아 중간에 끊겼고,
// 첫 화면·지시문 검사·입력문 검사의 시작 버튼이 전부 폼에 닿지 못했다.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./Layout";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ loggedIn: false, logout: vi.fn() }) }));
vi.mock("./MockBanner", () => ({ MockBanner: () => null }));
vi.mock("../lib/scroll", async () => {
  const actual = await vi.importActual<typeof import("../lib/scroll")>("../lib/scroll");
  return { ...actual, settleToAnchor: vi.fn(() => () => {}) };
});

// jsdom 은 window.scrollTo 를 구현하지 않는다(효과가 부르면 경고만 찍힌다). 대역을 둔다.
beforeEach(() => { vi.stubGlobal("scrollTo", () => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Probe() {
  const location = useLocation();
  return <>
    <a href="#start">시작으로</a>
    <a href="#없음">없는 섹션</a>
    <section id="start">폼</section>
    <output data-testid="hash">{location.hash}</output>
  </>;
}

async function renderShell() {
  await act(async () => {
    render(<MemoryRouter initialEntries={["/diagnose"]}>
      <Routes><Route element={<Layout />}><Route path="/diagnose" element={<Probe />} /></Route></Routes>
    </MemoryRouter>);
  });
}

it("화면 안 #링크를 누르면 라우터의 해시가 바뀐다", async () => {
  await renderShell();
  expect(screen.getByTestId("hash").textContent).toBe("");
  await act(async () => { fireEvent.click(screen.getByText("시작으로")); });
  expect(screen.getByTestId("hash").textContent).toBe("#start");
});

it("같은 #링크를 다시 눌러도 스크롤을 다시 시도한다", async () => {
  const { settleToAnchor } = await import("../lib/scroll");
  await renderShell();
  await act(async () => { fireEvent.click(screen.getByText("시작으로")); });
  const first = vi.mocked(settleToAnchor).mock.calls.length;
  await act(async () => { fireEvent.click(screen.getByText("시작으로")); });
  // ★ 두 번째 클릭이 먹통이면, 폼까지 갔다가 위로 올라온 사용자는 버튼이 죽은 줄 안다.
  expect(vi.mocked(settleToAnchor).mock.calls.length).toBeGreaterThan(first);
  const calls = vi.mocked(settleToAnchor).mock.calls;
  expect(calls[calls.length - 1][0]).toBe("start");
});

it("이 화면에 없는 앵커는 가로채지 않는다(브라우저에 맡긴다)", async () => {
  await renderShell();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => { screen.getByText("없는 섹션").dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(false);
  expect(screen.getByTestId("hash").textContent).toBe("");
});
