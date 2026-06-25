import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelIpcRequest: vi.fn(),
  finishIpcRequest: vi.fn(),
}));

vi.mock("./client", () => ({
  ipc: {
    cancelIpcRequest: mocks.cancelIpcRequest,
    finishIpcRequest: mocks.finishIpcRequest,
    getCatalogEntry: vi.fn(),
  },
}));

import { beginAbortableIpcRequest, withAbortableIpc } from "./abortable";

describe("abortable IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null request id when no signal is provided", () => {
    expect(beginAbortableIpcRequest()).toBeNull();
  });

  it("cancels Rust IPC request when signal aborts", async () => {
    const controller = new AbortController();
    const id = beginAbortableIpcRequest(controller.signal);
    expect(id).not.toBeNull();
    controller.abort();
    expect(mocks.cancelIpcRequest).toHaveBeenCalledWith(id);
  });

  it("finishes IPC request after invoke completes", async () => {
    const result = await withAbortableIpc(undefined, async (id) => {
      expect(id).toBeNull();
      return "ok";
    });
    expect(result).toBe("ok");
    expect(mocks.finishIpcRequest).not.toHaveBeenCalled();
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withAbortableIpc(controller.signal, async () => "nope"),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
