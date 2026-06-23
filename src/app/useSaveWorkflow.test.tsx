import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushToast = vi.fn();

vi.mock("../state/uiStore", () => ({
  useUiStore: (selector: (state: unknown) => unknown) => selector({ pushToast }),
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
  });
});
