import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../../ipc/types";

vi.mock("../../ipc/client", () => ({
  ipc: {
    saveBatch: vi.fn(),
    saveTextures: vi.fn(),
    listProjectBackups: vi.fn(),
    restoreProjectBackup: vi.fn(),
  },
}));

vi.mock("../editor/textureDocument", () => ({
  collectDirtyTextureEntries: vi.fn(),
  markTexturesSaved: vi.fn(),
}));

import { ipc } from "../../ipc/client";
import { collectDirtyTextureEntries, markTexturesSaved } from "../editor/textureDocument";
import { restoreLatestBackup, saveDirtyTextures } from "./saveTextures";

const handle: ProjectHandle = { id: 1 };

describe("saveDirtyTextures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when nothing is dirty", async () => {
    vi.mocked(collectDirtyTextureEntries).mockResolvedValue([]);
    const result = await saveDirtyTextures(handle);
    expect(result.savedCount).toBe(0);
    expect(ipc.saveBatch).not.toHaveBeenCalled();
  });

  it("uses saveBatch and marks textures saved", async () => {
    vi.mocked(collectDirtyTextureEntries).mockResolvedValue([
      { path: "assets/minecraft/textures/block/a.png", pngBase64: "abc", revision: 7 },
    ]);
    vi.mocked(ipc.saveBatch).mockResolvedValue({
      savedCount: 1,
      savedPaths: ["assets/minecraft/textures/block/a.png"],
      originalPaths: ["assets/minecraft/textures/block/a.png"],
      backupPath: "/tmp/backup",
    });

    const result = await saveDirtyTextures(handle, { mode: "overwrite" });
    expect(ipc.saveBatch).toHaveBeenCalledWith(
      handle,
      [{ path: "assets/minecraft/textures/block/a.png", pngBase64: "abc" }],
      { mode: "overwrite" },
    );
    expect(markTexturesSaved).toHaveBeenCalledWith(
      ["assets/minecraft/textures/block/a.png"],
      ["assets/minecraft/textures/block/a.png"],
      [{ path: "assets/minecraft/textures/block/a.png", pngBase64: "abc", revision: 7 }],
    );
    expect(result.savedCount).toBe(1);
    expect(result.backupPath).toBe("/tmp/backup");
  });

  it("validates rename mode", async () => {
    vi.mocked(collectDirtyTextureEntries).mockResolvedValue([
      { path: "a.png", pngBase64: "x", revision: 1 },
      { path: "b.png", pngBase64: "y", revision: 2 },
    ]);
    await expect(
      saveDirtyTextures(handle, { mode: "rename", targetPath: "c.png" }),
    ).rejects.toThrow(/exactly one dirty texture/);
  });

  it("does not mark saved when saveBatch fails", async () => {
    vi.mocked(collectDirtyTextureEntries).mockResolvedValue([
      { path: "assets/minecraft/textures/block/a.png", pngBase64: "abc", revision: 3 },
    ]);
    vi.mocked(ipc.saveBatch).mockRejectedValueOnce(new Error("disk full"));

    await expect(saveDirtyTextures(handle)).rejects.toThrow(/disk full/);
    expect(markTexturesSaved).not.toHaveBeenCalled();
  });
});

describe("restoreLatestBackup", () => {
  it("reports when no backups exist", async () => {
    vi.mocked(ipc.listProjectBackups).mockResolvedValue([]);
    const result = await restoreLatestBackup(handle);
    expect(result).toEqual({ restored: false, reason: "no backups found" });
  });
});
