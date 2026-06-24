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
