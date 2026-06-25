import { Channel } from "@tauri-apps/api/core";

import { ipc } from "../../ipc/client";
import type { IndexEvent, LogTailResponse, ProjectHandle, ReindexResult } from "../../ipc/types";
import { requireProjectHandle } from "./serviceValidation";

export function revealLogDir(): Promise<void> {
  return ipc.revealLogDir();
}

export function invalidateProjectIndex(handle: ProjectHandle): Promise<void> {
  return ipc.invalidateProjectIndex(requireProjectHandle(handle));
}

export function reindexProject(
  handle: ProjectHandle,
  onEvent: Channel<IndexEvent>,
  changedPaths: string[] | null,
): Promise<ReindexResult> {
  return ipc.reindexProject(requireProjectHandle(handle), onEvent, changedPaths);
}

export function readRecentLogs(maxLines = 200): Promise<LogTailResponse> {
  const clamped = Math.max(1, Math.min(2000, Math.floor(maxLines)));
  return ipc.readRecentLogs(clamped);
}
