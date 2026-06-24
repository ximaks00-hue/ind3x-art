import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexEvent } from "../ipc/types";
import { useCatalogStore } from "../features/catalog/catalogStore";
import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((event: IndexEvent) => void) | null = null;
  },
}));

vi.mock("../features/viewer3d/textureLoader", () => ({
  clearTextureCache: vi.fn(),
}));

const pushToast = vi.fn();

vi.mock("../ipc/client", async () => {
  const { createE2eMockIpc } = await import("../ipc/e2eMock");
  const { IpcError, isCoreError } = await import("../ipc/errors");
  return {
    ipc: createE2eMockIpc(),
    IpcError,
    isCoreError,
  };
});

import { ipc } from "../ipc/client";
import { useProjectSource } from "./useProjectSource";

describe("useProjectSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      handle: null,
      sourcePath: null,
      indexStatus: "idle",
      queryTotal: 0,
      assetTotal: 0,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);
    useCatalogStore.getState().reset();
    useSettingsStore.setState({
      catalogLanguage: "en_us",
      workspaceMode: "classic",
    });
    useUiStore.setState({
      pushToast,
    } as Partial<ReturnType<typeof useUiStore.getState>>);
  });

  it("opens a source and records asset and catalog totals separately", async () => {
    const { result } = renderHook(() => useProjectSource());

    await act(async () => {
      const ok = await result.current.openSource("tests/fixtures/simple_pack");
      expect(ok).toBe(true);
    });

    await waitFor(() => {
      expect(useProjectStore.getState().handle).not.toBeNull();
      expect(useProjectStore.getState().indexStatus).toBe("done");
    });

    const state = useProjectStore.getState();
    expect(state.queryTotal).toBeGreaterThan(0);
    expect(pushToast).toHaveBeenCalledWith(
      expect.stringMatching(/Opened .* assets · .* catalog/),
      "success",
    );
  });

  it("restores catalog snapshot when reopen fails with an open project", async () => {
    const { result } = renderHook(() => useProjectSource());
    await act(async () => {
      await result.current.openSource("tests/fixtures/simple_pack");
    });

    useCatalogStore.getState().setQueryPage(
      [
        {
          id: "minecraft:kept",
          namespace: "minecraft",
          displayName: "Kept",
          kind: "block",
          sourcePath: "assets/minecraft/blockstates/kept.json",
          resolveKind: "blockstate",
          category: "building",
          searchTokens: [],
          texturePaths: [],
          iconKey: "minecraft:kept:",
          aliases: [],
          studioModelPath: "assets/minecraft/blockstates/kept.json",
          presentation: "block",
        },
      ],
      1,
      false,
      0,
    );
    useCatalogStore.getState().selectEntry(useCatalogStore.getState().entries[0]!);
    useSettingsStore.getState().setStudioSelectedCatalogId("minecraft:kept");

    vi.spyOn(ipc, "openSource").mockRejectedValueOnce(new Error("permission denied"));

    await act(async () => {
      const ok = await result.current.openSource("tests/fixtures/missing_pack");
      expect(ok).toBe(false);
    });

    expect(useCatalogStore.getState().entries).toHaveLength(1);
    expect(useCatalogStore.getState().selectedId).toBe("minecraft:kept");
    expect(useSettingsStore.getState().studioSelectedCatalogId).toBe("minecraft:kept");
    expect(pushToast).toHaveBeenCalledWith(
      "Failed to open: permission denied",
      "error",
    );
  });

  it("shows formatted error when first open fails", async () => {
    vi.spyOn(ipc, "openSource").mockRejectedValueOnce(new Error("corrupt JAR"));

    const { result } = renderHook(() => useProjectSource());
    await act(async () => {
      const ok = await result.current.openSource("broken.jar");
      expect(ok).toBe(false);
    });

    expect(useProjectStore.getState().indexStatus).toBe("error");
    expect(pushToast).toHaveBeenCalledWith("Failed to open: corrupt JAR", "error");
  });
});
