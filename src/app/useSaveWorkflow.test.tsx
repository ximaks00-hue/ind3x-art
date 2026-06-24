import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushToast = vi.fn();
const triggerSaveFlash = vi.fn();

vi.mock("../state/uiStore", () => ({
  useUiStore: (selector: (state: unknown) => unknown) =>
    selector({ pushToast, triggerSaveFlash }),
}));

vi.mock("../state/projectStore", () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      handle: { id: 1 },
      sourcePath: "/fixture/simple_pack",
    }),
}));

vi.mock("../features/save/useDirtyTextures", () => ({
  useDirtyTextureCount: () => 1,
}));

vi.mock("../features/save/saveTextures", () => ({
  saveDirtyTextures: vi.fn().mockResolvedValue({
    savedCount: 1,
    originalPaths: ["assets/minecraft/textures/block/test_stone.png"],
    backupPath: "/tmp/backup",
  }),
  restoreLatestBackup: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import { saveDirtyTextures } from "../features/save/saveTextures";
import { restoreLatestBackup } from "../features/save/saveTextures";
import { useSaveWorkflow } from "./useSaveWorkflow";

describe("useSaveWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes canSave when handle and dirty textures exist", () => {
    const { result } = renderHook(() =>
      useSaveWorkflow({ openSource: vi.fn(), opening: false }),
    );
    expect(result.current.canSave).toBe(true);
    expect(result.current.dirtyCount).toBe(1);
  });

  it("handleSave delegates to saveDirtyTextures", async () => {
    const { result } = renderHook(() =>
      useSaveWorkflow({ openSource: vi.fn(), opening: false }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(saveDirtyTextures).toHaveBeenCalledWith({ id: 1 }, { mode: "overwrite" });
    expect(pushToast).toHaveBeenCalledWith("Saved 1 texture(s)", "success");
    expect(triggerSaveFlash).toHaveBeenCalled();
  });

  it("handleSave surfaces save errors to toast", async () => {
    vi.mocked(saveDirtyTextures).mockRejectedValueOnce(new Error("save failed hard"));
    const { result } = renderHook(() =>
      useSaveWorkflow({ openSource: vi.fn(), opening: false }),
    );
    await act(async () => {
      await result.current.handleSave();
    });
    expect(pushToast).toHaveBeenCalledWith("save failed hard", "error");
  });

  it("handleRestoreBackup reports non-restored reason", async () => {
    vi.mocked(restoreLatestBackup).mockResolvedValueOnce({
      restored: false,
      reason: "No backup found",
    });
    const { result } = renderHook(() =>
      useSaveWorkflow({ openSource: vi.fn(), opening: false }),
    );
    await act(async () => {
      await result.current.handleRestoreBackup();
    });
    expect(pushToast).toHaveBeenCalledWith("No backup found", "info");
  });
});
