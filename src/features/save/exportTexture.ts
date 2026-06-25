import { open } from "@tauri-apps/plugin-dialog";

import { throwIfAborted } from "../../ipc/abortable";
import { ipc } from "../../ipc/client";
import type { ProjectHandle } from "../../ipc/types";
import {
  ensureTextureDocument,
  getTextureCanvas,
} from "../editor/textureDocument";
import { canvasToPngBase64Async } from "../editor/textureEncodeWorkerClient";

/** Export one texture file to a folder (dirty or clean — uses current canvas). */
export async function exportTextureToFolder(
  handle: ProjectHandle,
  texturePath: string,
  options?: { signal?: AbortSignal },
): Promise<{ exported: boolean; folder?: string }> {
  throwIfAborted(options?.signal);
  await ensureTextureDocument(handle, texturePath);
  throwIfAborted(options?.signal);
  const canvas = getTextureCanvas(texturePath);
  if (!canvas) {
    throw new Error("Texture is not loaded");
  }

  const folder = await open({
    multiple: false,
    directory: true,
    title: "Export texture to folder",
  });
  if (typeof folder !== "string") {
    return { exported: false };
  }

  throwIfAborted(options?.signal);
  const pngBase64 = await canvasToPngBase64Async(canvas);
  throwIfAborted(options?.signal);
  await ipc.saveTextures(
    handle,
    [{ path: texturePath, pngBase64 }],
    { mode: "exportFolder", targetPath: folder },
  );

  return { exported: true, folder };
}

/** Download a single texture PNG in the browser (dev / fallback). */
export async function downloadTexturePng(texturePath: string, handle: ProjectHandle): Promise<void> {
  await ensureTextureDocument(handle, texturePath);
  const canvas = getTextureCanvas(texturePath);
  if (!canvas) throw new Error("Texture is not loaded");

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = texturePath.split("/").pop() ?? "texture.png";
  anchor.click();
  URL.revokeObjectURL(url);
}
