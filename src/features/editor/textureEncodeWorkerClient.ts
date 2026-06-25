import * as Comlink from "comlink";

import type { TextureEncodeWorkerApi } from "./textureEncodeWorker";

const TERMINATE_GRACE_MS = 10_000;

let worker: Worker | null = null;
let proxy: Comlink.Remote<TextureEncodeWorkerApi> | null = null;
let refCount = 0;
let terminateTimer: ReturnType<typeof setTimeout> | undefined;

function cancelScheduledTerminate(): void {
  if (terminateTimer) {
    clearTimeout(terminateTimer);
    terminateTimer = undefined;
  }
}

function scheduleTerminate(): void {
  cancelScheduledTerminate();
  terminateTimer = setTimeout(() => {
    terminateTimer = undefined;
    if (refCount > 0) return;
    worker?.terminate();
    worker = null;
    proxy = null;
  }, TERMINATE_GRACE_MS);
}

function ensureTextureEncodeWorker(): Comlink.Remote<TextureEncodeWorkerApi> {
  cancelScheduledTerminate();
  if (!worker || !proxy) {
    worker = new Worker(new URL("./textureEncodeWorker.ts", import.meta.url), {
      type: "module",
    });
    proxy = Comlink.wrap<TextureEncodeWorkerApi>(worker);
  }
  return proxy;
}

function acquireTextureEncodeWorker(): Comlink.Remote<TextureEncodeWorkerApi> {
  refCount += 1;
  return ensureTextureEncodeWorker();
}

function releaseTextureEncodeWorker(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  scheduleTerminate();
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
    // TEC-001: read pixels on the main thread (Canvas2D); transfer the buffer to the encode worker.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return await workerApi.canvasPixelsToPngBase64(
      canvas.width,
      canvas.height,
      Comlink.transfer(imageData.data, [imageData.data.buffer]),
    );
  } finally {
    releaseTextureEncodeWorker();
  }
}
