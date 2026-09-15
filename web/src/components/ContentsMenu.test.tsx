import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ContentsMenu } from "./ContentsMenu";

afterEach(cleanup);

it("상단 메뉴는 각각 별도 페이지를 가리키고 호버하면 해당 페이지의 세부 항목만 열린다", () => {
  render(<MemoryRouter><ContentsMenu /></MemoryRouter>);
  const pages = [["서비스 소개", "/"], ["지시문 검사", "/diagnose"], ["입력문 검사", "/detect"]];
  for (const [name, path] of pages) {
    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("href")).toBe(path);
    const menu = link.closest(".contents-menu")!;
    fireEvent.mouseEnter(menu);
    const trigger = screen.getByRole("button", { name: `${name} 세부 메뉴` });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll("a")).toHaveLength(3);
    panel.querySelectorAll("a").forEach((item) => expect(item.getAttribute("href")?.startsWith(`${path}#`)).toBe(true));
    fireEvent.mouseLeave(menu);
    expect(panel.hidden).toBe(true);
  }
});

it("키보드로 세부 메뉴를 열고 Escape로 닫는다", () => {
  render(<MemoryRouter><ContentsMenu /></MemoryRouter>);
  const trigger = screen.getByRole("button", { name: "지시문 검사 세부 메뉴" });
  fireEvent.click(trigger);
  expect(screen.getByRole("link", { name: /검사 시작/ }).getAttribute("href")).toBe("/diagnose#start");
  fireEvent.keyDown(trigger, { key: "Escape" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});
