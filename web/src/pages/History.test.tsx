import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api/client";
import { History } from "./History";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("31번째 이후 진단도 페이지 이동과 검색으로 열 수 있다", async () => {
  vi.spyOn(api, "get").mockResolvedValue({ runs: Array.from({ length: 35 }, (_, i) => ({
    run_id: `run_${String(i + 1).padStart(2, "0")}`, created_at: "2026-09-11T12:00:00", target_model: "test-model",
    grade: null, asr_before: null, asr_after: null,
  })) });
  render(<MemoryRouter><History /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText("run_01")).toBeTruthy());
  expect(screen.queryByText("run_35")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("run_35")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("진단 검색"), { target: { value: "run_02" } });
  expect(screen.getByText("run_02")).toBeTruthy();
  expect(screen.queryByText("run_35")).toBeNull();
});
