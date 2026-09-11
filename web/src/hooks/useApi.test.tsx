import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useApi } from "./useApi";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("경로를 바꾼 뒤 이전 요청이 늦게 끝나도 현재 데이터를 덮어쓰지 않는다", async () => {
  let resolveOld!: (value: unknown) => void;
  vi.spyOn(api, "get").mockImplementation(path => path === "/api/old"
    ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ id: "new" }) as never);
  const { result, rerender } = renderHook(({ path }) => useApi<{ id: string }>(path), { initialProps: { path: "/api/old" } });
  rerender({ path: "/api/new" });
  await waitFor(() => expect(result.current.data?.id).toBe("new"));
  await act(async () => resolveOld({ id: "old" }));
  expect(result.current.data?.id).toBe("new");
});

it("오류 후 다시 불러오면 복구한다", async () => {
  vi.spyOn(api, "get").mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useApi<{ ok: boolean }>("/api/health"));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.data?.ok).toBe(true));
  expect(result.current.error).toBeNull();
});
