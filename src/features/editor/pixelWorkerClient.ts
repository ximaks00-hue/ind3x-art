/**
 * Shared pixel worker — one instance for 2D + 3D editors.
 */
import * as Comlink from "comlink";

import type { PixelWorkerApi } from "./pixelWorker";

const TERMINATE_GRACE_MS = 10_000;

let worker: Worker | null = null;
let proxy: Comlink.Remote<PixelWorkerApi> | null = null;
let refCount = 0;
let inFlightTasks = 0;
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
    if (refCount > 0 || inFlightTasks > 0) return;
    worker?.terminate();
    worker = null;
    proxy = null;
  }, TERMINATE_GRACE_MS);
}

function ensureWorker(): Comlink.Remote<PixelWorkerApi> {
  cancelScheduledTerminate();
  if (!worker) {
    worker = new Worker(new URL("./pixelWorker.ts", import.meta.url), {
      type: "module",
    });
    proxy = Comlink.wrap<PixelWorkerApi>(worker);
  }
  return proxy!;
}

export function acquirePixelWorker(): Comlink.Remote<PixelWorkerApi> {
  refCount += 1;
  return ensureWorker();
}

export function releasePixelWorker(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;
  if (inFlightTasks > 0) return;
  scheduleTerminate();
}

/** Track an in-flight worker task so termination waits for completion. */
export function trackPixelWorkerTask<T>(promise: Promise<T>): Promise<T> {
  cancelScheduledTerminate();
  inFlightTasks += 1;
  return promise.finally(() => {
    inFlightTasks = Math.max(0, inFlightTasks - 1);
    if (refCount === 0 && inFlightTasks === 0) {
      scheduleTerminate();
    }
  });
}

/** Test-only helpers */
export function __testPixelWorkerState() {
  return { refCount, inFlightTasks, hasWorker: worker !== null, terminateScheduled: terminateTimer != null };
}

export function __testResetPixelWorker(): void {
  cancelScheduledTerminate();
  worker?.terminate();
  worker = null;
  proxy = null;
  refCount = 0;
  inFlightTasks = 0;
}
