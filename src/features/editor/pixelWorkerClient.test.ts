import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("comlink", () => ({
  wrap: () => ({}),
  transfer: (value: unknown) => value,
}));

class FakeWorker {
  terminate = vi.fn();
}

import {
  __testPixelWorkerState,
  __testResetPixelWorker,
  acquirePixelWorker,
  releasePixelWorker,
  trackPixelWorkerTask,
} from "./pixelWorkerClient";

describe("pixelWorkerClient", () => {
  beforeEach(() => {
    __testResetPixelWorker();
    vi.stubGlobal("Worker", vi.fn(() => new FakeWorker()));
    vi.useFakeTimers();
  });

  afterEach(() => {
    __testResetPixelWorker();
    vi.useRealTimers();
  });

  it("defers worker termination after the last release", () => {
    acquirePixelWorker();
    releasePixelWorker();
    expect(__testPixelWorkerState().hasWorker).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(__testPixelWorkerState().hasWorker).toBe(false);
  });

  it("waits for in-flight tasks before terminating", async () => {
    acquirePixelWorker();
    let resolveTask!: () => void;
    const task = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    void trackPixelWorkerTask(task);
    releasePixelWorker();

    vi.advanceTimersByTime(10_000);
    expect(__testPixelWorkerState().hasWorker).toBe(true);

    resolveTask();
    await task;
    vi.advanceTimersByTime(10_000);
    expect(__testPixelWorkerState().hasWorker).toBe(false);
  });

  it("cancels scheduled termination when re-acquired within grace period", () => {
    acquirePixelWorker();
    releasePixelWorker();
    vi.advanceTimersByTime(5_000);
    acquirePixelWorker();
    vi.advanceTimersByTime(10_000);
    expect(__testPixelWorkerState().hasWorker).toBe(true);
    releasePixelWorker();
    vi.advanceTimersByTime(10_000);
    expect(__testPixelWorkerState().hasWorker).toBe(false);
  });
});
