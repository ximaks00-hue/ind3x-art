import { ipc } from "../../ipc/client";
import type { ProjectHandle, TexturePreview } from "../../ipc/types";
import { requireNonEmptyId, requireProjectHandle } from "./serviceValidation";

const MAX_PREVIEW_SIZE = 512;

export async function getTexturePreview(
  handle: ProjectHandle,
  assetPath: string,
  maxSize?: number,
): Promise<TexturePreview> {
  const clamped =
    maxSize == null
      ? undefined
      : Math.max(8, Math.min(MAX_PREVIEW_SIZE, Math.floor(maxSize)));
  return ipc.getTexturePreview(
    requireProjectHandle(handle),
    requireNonEmptyId(assetPath, "asset path"),
    clamped,
  );
}
