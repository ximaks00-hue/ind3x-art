import { ipc } from "./client";

let nextIpcRequestId = 1;

const abortListeners = new Map<number, () => void>();

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

/** Allocate a cancellable IPC request id wired to {@link AbortSignal}. */
export function beginAbortableIpcRequest(signal?: AbortSignal): number | null {
  throwIfAborted(signal);
  if (!signal) return null;

  const id = nextIpcRequestId++;
  const onAbort = () => {
    void ipc.cancelIpcRequest(id);
  };
  abortListeners.set(id, onAbort);
  signal.addEventListener("abort", onAbort, { once: true });
  return id;
}

export async function withAbortableIpc<T>(
  signal: AbortSignal | undefined,
  invoke: (ipcRequestId: number | null) => Promise<T>,
): Promise<T> {
  const id = beginAbortableIpcRequest(signal);
  try {
    const result = await invoke(id);
    throwIfAborted(signal);
    return result;
  } finally {
    if (id != null) {
      const onAbort = abortListeners.get(id);
      if (onAbort) {
        signal?.removeEventListener("abort", onAbort);
        abortListeners.delete(id);
      }
      void ipc.finishIpcRequest(id);
    }
  }
}
