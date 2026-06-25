import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { clearTextureDocuments } from "../features/editor/textureDocument";
import { restoreLatestBackup, saveDirtyTextures } from "../features/save/saveTextures";
import type { SaveDialogSubmit } from "../features/save/SaveDialog";
import { useDirtyTextureCount } from "../features/save/useDirtyTextures";
import type { SaveOptions } from "../ipc/types";
import { useInteractionStore } from "../state/interactionStore";
import { useProjectStore } from "../state/projectStore";
import { useViewerStore } from "../state/viewerStore";
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetSaving = useCallback((value: boolean) => {
    if (mountedRef.current) setSaving(value);
  }, []);

  const safeSetSaveMessage = useCallback((value: string | null) => {
    if (mountedRef.current) setSaveMessage(value);
  }, []);

  const runSave = useCallback(
    async (options?: SaveOptions) => {
      if (!handle || dirtyCount === 0 || savingRef.current) return;

      savingRef.current = true;
      safeSetSaving(true);
      setSaveMessage("writing textures…");
      try {
        const result = await saveDirtyTextures(handle, options);
        if (result.savedCount === 0) {
          safeSetSaveMessage("nothing to save");
          pushToast("Nothing to save", "info");
        } else {
          const backup = result.backupPath ? ` · backup: ${result.backupPath}` : "";
          const message = `Saved ${result.savedCount} texture(s)${backup}`;
          safeSetSaveMessage(message);
          pushToast(`Saved ${result.savedCount} texture(s)`, "success");
          triggerSaveFlash();
          useInteractionStore
            .getState()
            .captureCompareBeforeFromSave(useViewerStore.getState().currentRenderable);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "save failed";
        safeSetSaveMessage(message);
        pushToast(message, "error");
      } finally {
        savingRef.current = false;
        safeSetSaving(false);
      }
    },
    [handle, dirtyCount, pushToast, triggerSaveFlash, safeSetSaveMessage, safeSetSaving],
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
        safeSetSaveMessage(result.reason);
        pushToast(result.reason, "info");
        return;
      }

      clearTextureDocuments();
      await openSource(sourcePath);
      safeSetSaveMessage(`restored ${result.backup.label}`);
      pushToast("Backup restored and project reloaded", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "restore failed";
      safeSetSaveMessage(message);
      pushToast(message, "error");
    } finally {
      savingRef.current = false;
      safeSetSaving(false);
    }
  }, [handle, sourcePath, opening, openSource, pushToast, safeSetSaveMessage, safeSetSaving]);

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
