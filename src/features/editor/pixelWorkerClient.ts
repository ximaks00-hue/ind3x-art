/**
 * Shared pixel worker — one instance for 2D + 3D editors.
 */
import * as Comlink from "comlink";

import type { PixelWorkerApi } from "./pixelWorker";

let worker: Worker | null = null;
let proxy: Comlink.Remote<PixelWorkerApi> | null = null;
let refCount = 0;

export function acquirePixelWorker(): Comlink.Remote<PixelWorkerApi> {
  if (!worker) {
    worker = new Worker(new URL("./pixelWorker.ts", import.meta.url), {
      type: "module",
    });
    proxy = Comlink.wrap<PixelWorkerApi>(worker);
  }
  refCount += 1;
  return proxy!;
}

export function releasePixelWorker(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  worker?.terminate();
  worker = null;
  proxy = null;
}
