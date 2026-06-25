import { listen } from "@tauri-apps/api/event";

import type { IndexEvent } from "./types";

function canListenIndexEvents(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Subscribe to Rust index progress (emitted from blocking workers; avoids Channel deadlocks). */
export async function subscribeIndexEvents(
  onEvent: (event: IndexEvent) => void,
): Promise<() => void> {
  if (!canListenIndexEvents()) {
    return () => {};
  }

  const unlisten = await listen<IndexEvent>("index-event", (ev) => {
    onEvent(ev.payload);
  });
  return () => {
    void unlisten();
  };
}
