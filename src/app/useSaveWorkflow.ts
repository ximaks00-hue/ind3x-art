import { useCallback, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { clearTextureDocuments } from "../features/editor/textureDocument";
import { restoreLatestBackup, saveDirtyTextures } from "../features/save/saveTextures";
import type { SaveDialogSubmit } from "../features/save/SaveDialog";
import { useDirtyTextureCount } from "../features/save/useDirtyTextures";
import type { SaveOptions } from "../ipc/types";
import { useInteractionStore } from "../state/interactionStore";
import { useProjectStore } from "../state/projectStore";
import { useUiStore } from "../state/uiStore";

export function useSaveWorkflow({
  openSource,
  opening,
}: {
  openSource: (path: string) => Promise<boolean>;
  opening: boolean;
}) {
  const handle = useProjectStore((s) => s.handle);
  const sourcePath = useProjectStore((s) => s.sourcePath);
  const dirtyCount = useDirtyTextureCount();
  const pushToast = useUiStore((s) => s.pushToast);
  const triggerSaveFlash = useUiStore((s) => s.triggerSaveFlash);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const savingRef = useRef(false);

  const runSave = useCallback(
    async (options?: SaveOptions) => {
      if (!handle || dirtyCount === 0 || savingRef.current) return;

      savingRef.current = true;
      setSaving(true);
      setSaveMessage("writing textures…");
      try {
        const result = await saveDirtyTextures(handle, options);
        if (result.savedCount === 0) {
          setSaveMessage("nothing to save");
          pushToast("Nothing to save", "info");
        } else {
          const backup = result.backupPath ? ` · backup: ${result.backupPath}` : "";
          const message = `Saved ${result.savedCount} texture(s)${backup}`;
          setSaveMessage(message);
          pushToast(`Saved ${result.savedCount} texture(s)`, "success");
          triggerSaveFlash();
          useInteractionStore.getState().captureCompareBeforeFromSave();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "save failed";
        setSaveMessage(message);
        pushToast(message, "error");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [handle, dirtyCount, pushToast, triggerSaveFlash],
  );

  const handleSave = useCallback(async () => {
    await runSave({ mode: "overwrite" });
  }, [runSave]);

  const handleSaveDialogSubmit = useCallback(
    async (submit: SaveDialogSubmit) => {
      setSaveDialogOpen(false);

      if (submit.mode === "exportFolder") {
        const selected = await open({
          multiple: false,
          directory: true,
          title: "Export textures to folder",
        });
        if (typeof selected !== "string") return;
        await runSave({ mode: "exportFolder", targetPath: selected });
        return;
      }

      const options: SaveOptions = {
        mode: submit.mode,
        namespace: submit.namespace,
        targetPath: submit.targetPath,
      };
      await runSave(options);
    },
    [runSave],
  );

  const handleRestoreBackup = useCallback(async () => {
    if (!handle || !sourcePath || savingRef.current || opening) return;

    savingRef.current = true;
    setSaving(true);
    setSaveMessage("restoring backup…");
    try {
      const result = await restoreLatestBackup(handle);
      if (!result.restored) {
        setSaveMessage(result.reason);
        pushToast(result.reason, "info");
        return;
      }

      clearTextureDocuments();
      await openSource(sourcePath);
      setSaveMessage(`restored ${result.backup.label}`);
      pushToast("Backup restored and project reloaded", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "restore failed";
      setSaveMessage(message);
      pushToast(message, "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [handle, sourcePath, opening, openSource, pushToast]);

  return {
    saving,
    saveMessage,
    saveDialogOpen,
    backupDialogOpen,
    dirtyCount,
    setSaveDialogOpen,
    setBackupDialogOpen,
    handleSave,
    handleSaveDialogSubmit,
    handleRestoreBackup,
    canSave: Boolean(handle) && dirtyCount > 0 && !saving,
  };
}
