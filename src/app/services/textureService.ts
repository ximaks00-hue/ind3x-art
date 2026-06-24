import { ipc } from "../../ipc/client";
import type { ProjectHandle, TexturePreview } from "../../ipc/types";

export async function getTexturePreview(
  handle: ProjectHandle,
  assetPath: string,
  maxSize?: number,
): Promise<TexturePreview> {
  return ipc.getTexturePreview(handle, assetPath, maxSize);
}
