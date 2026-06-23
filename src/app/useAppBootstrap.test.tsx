import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setAppInfo = vi.fn();
const setIpcHealthy = vi.fn();

vi.mock("../ipc/client", () => ({
  ipc: {
    getAppInfo: vi.fn().mockResolvedValue({
      name: "inD3X Art",
      version: "0.1.0",
      target: "test",
      profile: "debug",
    }),
    ping: vi.fn().mockResolvedValue("pong"),
  },
}));

vi.mock("../state/projectStore", () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      appInfo: null,
      ipcHealthy: false,
      setAppInfo,
      setIpcHealthy,
    }),
}));

import { ipc } from "../ipc/client";
import { useAppBootstrap } from "./useAppBootstrap";

describe("useAppBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads app info and marks IPC healthy on mount", async () => {
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(setAppInfo).toHaveBeenCalled();
      expect(setIpcHealthy).toHaveBeenCalledWith(true);
    });

    expect(result.current.ipcHealthy).toBe(false);
    expect(ipc.ping).toHaveBeenCalled();
  });
});
