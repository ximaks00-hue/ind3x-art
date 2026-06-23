import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { createE2eMockIpc } from "./e2eMock";
import type {
  AppInfo,
  AssetFacets,
  AssetFilter,
  AssetPage,
  BackupInfo,
  CoreErrorPayload,
  IndexEvent,
  ModelRefInfo,
  OpenSourceResult,
  PageReq,
  ProjectHandle,
  RenderableModel,
  SaveJournalEntry,
  SaveTexturesResult,
  SaveOptions,
  TexturePreview,
  TextureSaveEntry,
  VariantKey,
} from "./types";

function isCoreError(value: unknown): value is CoreErrorPayload {
  return (
    typeof value === "object" && value !== null && "code" in value && "message" in value
  );
}

export class IpcError extends Error {
  readonly code: string;

  constructor(payload: CoreErrorPayload) {
    super(payload.message);
    this.name = "IpcError";
    this.code = payload.code;
  }
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (isCoreError(error)) {
      throw new IpcError(error);
    }
    throw error;
  }
}

const tauriIpc = {
  getAppInfo: () => invokeCommand<AppInfo>("get_app_info"),
  revealLogDir: () => invokeCommand<void>("reveal_log_dir"),
  ping: () => invokeCommand<string>("ping"),
  openSource: (path: string, onEvent: Channel<IndexEvent>) =>
    invokeCommand<OpenSourceResult>("open_source", { path, onEvent }),
  closeSource: (handle: ProjectHandle) => invokeCommand<void>("close_source", { handle }),
  cancelIndex: (handle: ProjectHandle) => invokeCommand<void>("cancel_index", { handle }),
  queryAssets: (handle: ProjectHandle, filter: AssetFilter, page: PageReq) =>
    invokeCommand<AssetPage>("query_assets", { handle, filter, page }),
  getAssetFacets: (handle: ProjectHandle) =>
    invokeCommand<AssetFacets>("get_asset_facets", { handle }),
  getTexturePreview: (handle: ProjectHandle, assetPath: string, maxSize?: number) =>
    invokeCommand<TexturePreview>("get_texture_preview", {
      handle,
      assetPath,
      maxSize,
    }),
  getTexture: (handle: ProjectHandle, texturePath: string) =>
    invokeCommand<TexturePreview>("get_texture", { handle, texturePath }),
  listVariants: (handle: ProjectHandle, assetPath: string) =>
    invokeCommand<VariantKey[]>("list_variants", { handle, assetPath }),
  modelsForTexture: (handle: ProjectHandle, assetPath: string) =>
    invokeCommand<ModelRefInfo[]>("models_for_texture", { handle, assetPath }),
  resolveRenderable: (handle: ProjectHandle, assetPath: string, variantKey?: string) =>
    invokeCommand<RenderableModel>("resolve_renderable", {
      handle,
      assetPath,
      variantKey,
    }),
  saveTextures: (
    handle: ProjectHandle,
    textures: TextureSaveEntry[],
    options?: SaveOptions,
  ) =>
    invokeCommand<SaveTexturesResult>("save_textures", {
      handle,
      textures,
      options,
    }),
  saveBatch: (
    handle: ProjectHandle,
    textures: TextureSaveEntry[],
    options?: SaveOptions,
  ) => invokeCommand<SaveTexturesResult>("save_batch", { handle, textures, options }),
  getSaveJournal: (handle: ProjectHandle) =>
    invokeCommand<SaveJournalEntry[]>("get_save_journal", { handle }),
  getTextureBinary: async (
    handle: ProjectHandle,
    texturePath: string,
  ): Promise<Uint8Array> => {
    const buf = await invoke<ArrayBuffer>("get_texture_binary", { handle, texturePath });
    return new Uint8Array(buf);
  },
  saveTextureMcmeta: (handle: ProjectHandle, texturePath: string, mcmetaJson: string) =>
    invokeCommand<void>("save_texture_mcmeta", { handle, texturePath, mcmetaJson }),
  listProjectBackups: (handle: ProjectHandle) =>
    invokeCommand<BackupInfo[]>("list_project_backups", { handle }),
  restoreProjectBackup: (handle: ProjectHandle, backupPath: string) =>
    invokeCommand<void>("restore_project_backup", { handle, backupPath }),
  restoreProjectBackupById: (handle: ProjectHandle, backupId: string) =>
    invokeCommand<void>("restore_project_backup_by_id", { handle, backupId }),
  createProjectBackup: (handle: ProjectHandle) =>
    invokeCommand<BackupInfo>("create_project_backup", { handle }),
  streamDemo: (onEvent: Channel<IndexEvent>) =>
    invokeCommand<void>("stream_demo", { onEvent }),
  onSourceChanged: (cb: (payload: { path: string; kind: string }) => void) =>
    listen<{ path: string; kind: string }>("source-changed", (e) => cb(e.payload)),
  onCacheInvalidated: (cb: () => void) => listen("cache-invalidated", () => cb()),
};

export const ipc =
  import.meta.env.VITE_E2E_MOCK === "true" ? createE2eMockIpc() : tauriIpc;
