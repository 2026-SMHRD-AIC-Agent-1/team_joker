import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api, NetworkError } from "../api/client";
import { RunPage } from "./RunPage";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ token: null, loggedIn: false }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("진행 중 네트워크 오류가 나도 다음 폴링으로 복구한다", async () => {
  vi.useFakeTimers();
  const running = { run_id: "run_test", status: "running", target: {}, progress: { calls_done: 1 } };
  const get = vi.spyOn(api, "get").mockResolvedValueOnce(running)
    .mockRejectedValueOnce(new NetworkError("offline"))
    .mockResolvedValue({ ...running, progress: { calls_done: 7 } });
  await act(async () => { render(<MemoryRouter initialEntries={["/runs/run_test"]}><Routes><Route path="/runs/:runId" element={<RunPage />} /></Routes></MemoryRouter>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(get).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(get).toHaveBeenCalledTimes(3);
  expect(screen.getByText(/대상 모델 호출 7회/)).toBeTruthy();
});
