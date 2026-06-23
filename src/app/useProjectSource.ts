import { useCallback, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { clearTextureDocuments } from "../features/editor/textureDocument";
import { clearTextureCache } from "../features/viewer3d/textureLoader";
import { ipc } from "../ipc/client";
import type { IndexEvent } from "../ipc/types";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";

export function useProjectSource(onBeforeOpen?: () => void) {
  const [opening, setOpening] = useState(false);
  const handle = useProjectStore((s) => s.handle);
  const sourcePath = useProjectStore((s) => s.sourcePath);
  const addRecentProject = useSettingsStore((s) => s.addRecentProject);
  const clearProject = useProjectStore((s) => s.clearProject);
  const setProject = useProjectStore((s) => s.setProject);
  const setHandle = useProjectStore((s) => s.setHandle);
  const appendAsset = useProjectStore((s) => s.appendAsset);
  const setIndexStatus = useProjectStore((s) => s.setIndexStatus);
  const setIndexProgress = useProjectStore((s) => s.setIndexProgress);
  const setFromCache = useProjectStore((s) => s.setFromCache);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const pushToast = useUiStore((s) => s.pushToast);

  const openSource = useCallback(
    async (path: string) => {
      if (handle) {
        try {
          await ipc.closeSource(handle);
        } catch {
          // ignore stale handle cleanup errors
        }
        clearProject();
        clearSelection();
        clearTextureDocuments();
        onBeforeOpen?.();
      }

      setOpening(true);
      setIndexStatus("running");
      setIndexProgress(0, 1, "starting");

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        switch (event.type) {
          case "started":
            setIndexProgress(0, event.total, "scanning");
            break;
          case "progress":
            setIndexProgress(event.scanned, event.total, event.stage);
            break;
          case "done":
            setFromCache(event.fromCache);
            setIndexProgress(100, 100, event.fromCache ? "from cache" : "indexed");
            break;
          case "warning":
            setIndexProgress(0, 0, `${event.path}: ${event.reason}`);
            break;
          case "asset":
            appendAsset(event.entry);
            break;
        }
      };

      try {
        const result = await ipc.openSource(path, onEvent);
        setHandle(result);
        const page = await ipc.queryAssets(
          result.handle,
          {},
          { offset: 0, limit: 100_000 },
        );
        setProject(result, page.entries);
        addRecentProject(result.sourcePath, result.sourceKind);
        pushToast(`Opened ${result.entryCount.toLocaleString()} assets`, "success");
        return true;
      } catch {
        setIndexStatus("error");
        clearProject();
        clearSelection();
        clearTextureDocuments();
        pushToast("Failed to open source", "error");
        return false;
      } finally {
        setOpening(false);
      }
    },
    [
      handle,
      onBeforeOpen,
      clearProject,
      clearSelection,
      setProject,
      setHandle,
      appendAsset,
      setIndexStatus,
      setIndexProgress,
      setFromCache,
      addRecentProject,
      pushToast,
    ],
  );

  const subscribeSourceEvents = useCallback(() => {
    let unlistenChanged: (() => void) | undefined;
    let unlistenInvalidated: (() => void) | undefined;
    let reloadPending = false;

    void ipc
      .onSourceChanged(({ path }) => {
        if (reloadPending) return;
        reloadPending = true;
        pushToast(`Source changed: ${path.split(/[\\/]/).pop()} — reloading…`, "info");
        setTimeout(() => {
          reloadPending = false;
          if (sourcePath) void openSource(sourcePath);
        }, 800);
      })
      .then((fn) => {
        unlistenChanged = fn;
      });

    void ipc
      .onCacheInvalidated(() => {
        clearTextureCache();
      })
      .then((fn) => {
        unlistenInvalidated = fn;
      });

    return () => {
      unlistenChanged?.();
      unlistenInvalidated?.();
    };
  }, [sourcePath, pushToast, openSource]);

  const openJar = useCallback(async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Minecraft Mod", extensions: ["jar", "zip"] }],
    });
    if (typeof selected === "string") {
      await openSource(selected);
    }
  }, [openSource]);

  const openFolder = useCallback(async () => {
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (typeof selected === "string") {
      await openSource(selected);
    }
  }, [openSource]);

  return {
    opening,
    openSource,
    openJar,
    openFolder,
    subscribeSourceEvents,
  };
}
