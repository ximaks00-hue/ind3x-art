import { ipc } from "../../ipc/client";
import type { ProjectHandle, SaveOptions } from "../../ipc/types";
import { collectDirtyTextureEntries, markTexturesSaved } from "../editor/textureDocument";

export async function saveDirtyTextures(handle: ProjectHandle, options?: SaveOptions) {
  const snapshots = await collectDirtyTextureEntries();
  if (snapshots.length === 0) {
    return {
      savedCount: 0,
      originalPaths: [] as string[],
      backupPath: undefined as string | undefined,
    };
  }
  const textures = snapshots.map(({ path, pngBase64, targetPath }) => ({
    path,
    pngBase64,
    targetPath,
  }));

  if (options?.mode === "rename") {
    if (textures.length !== 1) {
      throw new Error("Rename save works with exactly one dirty texture");
    }
    if (!options.targetPath?.trim()) {
      throw new Error("Rename save requires a target path");
    }
    textures[0] = {
      ...textures[0],
      targetPath: options.targetPath.trim(),
    };
  }

  // Prefer save_batch (atomic write + journal) when available, fall back to save_textures
  const result = await (ipc.saveBatch
    ? ipc.saveBatch(handle, textures, options)
    : ipc.saveTextures(handle, textures, options));
  markTexturesSaved(result.savedPaths, result.originalPaths, snapshots);
  return {
    savedCount: result.savedCount,
    originalPaths: result.originalPaths,
    backupPath: result.backupPath,
  };
}

export async function restoreLatestBackup(handle: ProjectHandle) {
  const backups = await ipc.listProjectBackups(handle);
  if (backups.length === 0) {
    return { restored: false as const, reason: "no backups found" };
  }

  await ipc.restoreProjectBackup(handle, backups[0].path);
  return { restored: true as const, backup: backups[0] };
}
