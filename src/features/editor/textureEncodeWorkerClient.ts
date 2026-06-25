import * as Comlink from "comlink";

import type { TextureEncodeWorkerApi } from "./textureEncodeWorker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<TextureEncodeWorkerApi> | null = null;
let refCount = 0;

function acquireTextureEncodeWorker(): Comlink.Remote<TextureEncodeWorkerApi> {
  if (!worker) {
    worker = new Worker(new URL("./textureEncodeWorker.ts", import.meta.url), {
      type: "module",
    });
    proxy = Comlink.wrap<TextureEncodeWorkerApi>(worker);
  }
  refCount += 1;
  return proxy!;
}

function releaseTextureEncodeWorker(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  worker?.terminate();
  worker = null;
  proxy = null;
}

/** Encode a canvas to PNG base64 off the main thread when workers are available. */
export async function canvasToPngBase64Async(
  canvas: HTMLCanvasElement,
): Promise<string> {
  if (typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined") {
    const { canvasToPngBase64 } = await import("./textureDocumentCore");
    return canvasToPngBase64(canvas);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("failed to read canvas pixels");
  }

  const workerApi = acquireTextureEncodeWorker();
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return await workerApi.canvasPixelsToPngBase64(
      canvas.width,
      canvas.height,
      imageData.data,
    );
  } finally {
    releaseTextureEncodeWorker();
  }
}
