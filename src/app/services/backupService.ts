import { ipc } from "../../ipc/client";
import type { BackupInfo, ProjectHandle, SaveJournalEntry } from "../../ipc/types";

export async function listProjectBackups(handle: ProjectHandle): Promise<BackupInfo[]> {
  return ipc.listProjectBackups(handle);
}

export async function getSaveJournal(handle: ProjectHandle): Promise<SaveJournalEntry[]> {
  return ipc.getSaveJournal(handle);
}

export async function createProjectBackup(handle: ProjectHandle): Promise<BackupInfo> {
  return ipc.createProjectBackup(handle);
}

export async function restoreBackup(
  handle: ProjectHandle,
  backupId: string,
  backupPath: string,
): Promise<void> {
  if (ipc.restoreProjectBackupById) {
    return ipc.restoreProjectBackupById(handle, backupId);
  }
  return ipc.restoreProjectBackup(handle, backupPath);
}

/** Matches Rust `backup_id`: first 8 bytes of SHA-256(path) as hex. */
export async function backupIdFromPath(path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const bytes = new Uint8Array(digest).slice(0, 8);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
