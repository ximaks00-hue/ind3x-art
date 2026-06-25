import { ipc } from "../../ipc/client";
import { withAbortableIpc } from "../../ipc/abortable";
import type { ProjectHandle, TexturePreview } from "../../ipc/types";
import { requireNonEmptyId, requireProjectHandle } from "./serviceValidation";

const MAX_PREVIEW_SIZE = 512;

/** Single-texture preview (tier-1 catalog icons still use this path; batch via {@link getTexturePreviewsBatch}). */
export async function getTexturePreview(
  handle: ProjectHandle,
  assetPath: string,
  maxSize?: number,
  options?: { signal?: AbortSignal },
): Promise<TexturePreview> {
  const clamped =
    maxSize == null
      ? undefined
      : Math.max(8, Math.min(MAX_PREVIEW_SIZE, Math.floor(maxSize)));
  return withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.getTexturePreview(
      requireProjectHandle(handle),
      requireNonEmptyId(assetPath, "asset path"),
      clamped,
      ipcRequestId,
    ),
  );
}

export async function getTexturePreviewsBatch(
  handle: ProjectHandle,
  assetPaths: string[],
  maxSize?: number,
  options?: { signal?: AbortSignal },
): Promise<Map<string, TexturePreview>> {
  if (assetPaths.length === 0) return new Map();
  const clamped =
    maxSize == null
      ? undefined
      : Math.max(8, Math.min(MAX_PREVIEW_SIZE, Math.floor(maxSize)));
  const rows = await withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.getTexturePreviewsBatch(
      requireProjectHandle(handle),
      assetPaths.map((path) => requireNonEmptyId(path, "asset path")),
      clamped,
      ipcRequestId,
    ),
  );
  const out = new Map<string, TexturePreview>();
  for (const row of rows) {
    if (row.preview) out.set(row.path, row.preview);
  }
  return out;
}
