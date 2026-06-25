import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setAppInfo = vi.fn();
const setIpcHealthy = vi.fn();
const pushToast = vi.fn();

const mockAppInfo = vi.hoisted(() => ({
  name: "inD3X Art",
  version: "0.3.6",
  identifier: "com.ind3x.art",
  target: "test",
  profile: "debug",
  logDir: null as string | null,
  cacheEphemeral: false,
}));

vi.mock("../ipc/client", () => ({
  ipc: {
    getAppInfo: vi.fn().mockResolvedValue(mockAppInfo),
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

vi.mock("../state/uiStore", () => ({
  useUiStore: (selector: (state: unknown) => unknown) =>
    selector({
      pushToast,
    }),
}));

import { ipc } from "../ipc/client";
import { useSettingsStore } from "../state/settingsStore";
import { useViewerStore } from "../state/viewerStore";
import { useAppBootstrap } from "./useAppBootstrap";

describe("useAppBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.ping).mockResolvedValue("pong");
    vi.mocked(ipc.getAppInfo).mockResolvedValue(mockAppInfo);
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

  it("marks IPC unhealthy when bootstrap fails", async () => {
    vi.mocked(ipc.ping).mockRejectedValue(new Error("ipc down"));
    vi.mocked(ipc.getAppInfo).mockRejectedValue(new Error("ipc down"));

    renderHook(() => useAppBootstrap());

    await waitFor(
      () => {
        expect(setIpcHealthy).toHaveBeenCalledWith(false);
        expect(pushToast).toHaveBeenCalledWith(
          "Backend unreachable — restart the app",
          "error",
        );
      },
      { timeout: 5000 },
    );
  });

  it("syncs viewer preferences after successful bootstrap", async () => {
    useSettingsStore.setState({
      viewerLightingPreset: "flat",
      viewerShowGrid: false,
      viewerShowVignette: true,
      viewerShowDevOverlay: false,
    });
    useViewerStore.setState({
      lightingPreset: "studio",
      showGrid: true,
      showVignette: false,
      showDevOverlay: true,
    });

    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(setIpcHealthy).toHaveBeenCalledWith(true);
    });

    const viewer = useViewerStore.getState();
    expect(viewer.lightingPreset).toBe("flat");
    expect(viewer.showGrid).toBe(false);
    expect(viewer.showVignette).toBe(true);
    expect(viewer.showDevOverlay).toBe(false);
  });
});
