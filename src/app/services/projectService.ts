import { Channel } from "@tauri-apps/api/core";

import { ipc } from "../../ipc/client";
import type { IndexEvent, LogTailResponse, ProjectHandle, ReindexResult } from "../../ipc/types";

export function revealLogDir(): Promise<void> {
  return ipc.revealLogDir();
}

export function invalidateProjectIndex(handle: ProjectHandle): Promise<void> {
  return ipc.invalidateProjectIndex(handle);
}

export function reindexProject(
  handle: ProjectHandle,
  onEvent: Channel<IndexEvent>,
  changedPaths: string[] | null,
): Promise<ReindexResult> {
  return ipc.reindexProject(handle, onEvent, changedPaths);
}

export function readRecentLogs(maxLines = 200): Promise<LogTailResponse> {
  return ipc.readRecentLogs(maxLines);
}
