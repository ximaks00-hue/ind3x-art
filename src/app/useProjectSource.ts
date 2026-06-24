import { useCallback, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { clearTextureDocuments } from "../features/editor/textureDocument";
import { resetCatalogIconCache } from "../features/catalog/catalogIconCache";
import { resetCatalogIconPipeline } from "../features/catalog/catalogIconPipeline";
import { useCatalogStore } from "../features/catalog/catalogStore";
import { resetThumbnailCache } from "../features/explorer/thumbnailCache";
import { clearTextureCache } from "../features/viewer3d/textureLoader";
import { ipc } from "../ipc/client";
import type { IndexEvent } from "../ipc/types";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";

export function useProjectSource(onBeforeOpen?: () => void) {
  const [opening, setOpening] = useState(false);
  const openRequestIdRef = useRef(0);
  const handle = useProjectStore((s) => s.handle);
  const addRecentProject = useSettingsStore((s) => s.addRecentProject);
  const setLastSessionPath = useSettingsStore((s) => s.setLastSessionPath);
  const clearProject = useProjectStore((s) => s.clearProject);
  const finishOpen = useProjectStore((s) => s.finishOpen);
  const bumpQueryRevision = useProjectStore((s) => s.bumpQueryRevision);
  const setHandle = useProjectStore((s) => s.setHandle);
  const setIndexStatus = useProjectStore((s) => s.setIndexStatus);
  const setIndexProgress = useProjectStore((s) => s.setIndexProgress);
  const setFromCache = useProjectStore((s) => s.setFromCache);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const pushToast = useUiStore((s) => s.pushToast);

  const openSource = useCallback(
    async (path: string) => {
      const requestId = openRequestIdRef.current + 1;
      openRequestIdRef.current = requestId;
      if (handle) {
        try {
          await ipc.closeSource(handle);
        } catch {
          // ignore stale handle cleanup errors
        }
        clearTextureCache(handle);
        clearProject();
        clearSelection();
        clearTextureDocuments();
        resetThumbnailCache();
        resetCatalogIconCache();
        resetCatalogIconPipeline();
        useCatalogStore.getState().reset();
        onBeforeOpen?.();
      }

      setOpening(true);
      setIndexStatus("running");
      setIndexProgress(0, 1, "starting");

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        if (openRequestIdRef.current !== requestId) {
          return;
        }
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
            break;
        }
      };

      try {
        const result = await ipc.openSource(path, onEvent);
        if (openRequestIdRef.current !== requestId) {
          try {
            await ipc.closeSource(result.handle);
          } catch {
            // ignore stale handle cleanup errors
          }
          return false;
        }
        setHandle(result);
        finishOpen(result);
        bumpQueryRevision();
        useCatalogStore.getState().bumpQueryRevision();
        addRecentProject(result.sourcePath, result.sourceKind);
        setLastSessionPath(result.sourcePath);
        pushToast(`Opened ${result.entryCount.toLocaleString()} assets`, "success");
        return true;
      } catch {
        if (openRequestIdRef.current !== requestId) {
          return false;
        }
        setIndexStatus("error");
        clearProject();
        clearSelection();
        clearTextureDocuments();
        pushToast("Failed to open source", "error");
        return false;
      } finally {
        if (openRequestIdRef.current === requestId) {
          setOpening(false);
        }
      }
    },
    [
      handle,
      onBeforeOpen,
      clearProject,
      clearSelection,
      finishOpen,
      bumpQueryRevision,
      setHandle,
      setIndexStatus,
      setIndexProgress,
      setFromCache,
      addRecentProject,
      setLastSessionPath,
      pushToast,
    ],
  );

  const subscribeSourceEvents = useCallback(() => {
    let unlistenChanged: (() => void) | undefined;
    let unlistenInvalidated: (() => void) | undefined;
    let reloadPending = false;

    const reindexCurrent = async () => {
      const currentHandle = useProjectStore.getState().handle;
      if (!currentHandle) return false;

      setIndexStatus("running");
      setIndexProgress(0, 1, "reindexing");

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        switch (event.type) {
          case "started":
            setIndexProgress(0, event.total, "reindexing");
            break;
          case "progress":
            setIndexProgress(event.scanned, event.total, event.stage);
            break;
          case "done":
            setIndexProgress(100, 100, event.fromCache ? "from cache" : "reindexed");
            break;
          case "warning":
            setIndexProgress(0, 0, `${event.path}: ${event.reason}`);
            break;
          default:
            break;
        }
      };

      try {
        const count = await ipc.reindexProject(currentHandle, onEvent);
        finishOpen({
          handle: currentHandle,
          sourcePath: useProjectStore.getState().sourcePath ?? "",
          sourceKind: useProjectStore.getState().sourceKind ?? "folder",
          entryCount: count,
          fromCache: false,
          packFormat: null,
        });
        bumpQueryRevision();
        useCatalogStore.getState().bumpQueryRevision();
        clearTextureCache(currentHandle);
        resetThumbnailCache();
        resetCatalogIconCache();
        resetCatalogIconPipeline();
        setIndexStatus("done");
        pushToast(`Reindexed ${count.toLocaleString()} assets`, "success");
        return true;
      } catch {
        setIndexStatus("error");
        pushToast("Failed to reindex project", "error");
        return false;
      }
    };

    void ipc
      .onSourceChanged(({ path }) => {
        if (reloadPending) return;
        reloadPending = true;
        pushToast(`Source changed: ${path.split(/[\\/]/).pop()} — reloading…`, "info");
        setTimeout(() => {
          reloadPending = false;
          const currentHandle = useProjectStore.getState().handle;
          if (currentHandle) {
            void reindexCurrent();
          }
        }, 800);
      })
      .then((fn) => {
        unlistenChanged = fn;
      });

    void ipc
      .onCacheInvalidated(() => {
        clearTextureCache();
        resetThumbnailCache();
        const currentHandle = useProjectStore.getState().handle;
        if (currentHandle) {
          void ipc.invalidateProjectIndex(currentHandle);
        }
      })
      .then((fn) => {
        unlistenInvalidated = fn;
      });

    return () => {
      unlistenChanged?.();
      unlistenInvalidated?.();
    };
  }, [pushToast, finishOpen, bumpQueryRevision, setIndexProgress, setIndexStatus]);

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

  const openDemoPack = useCallback(async () => {
    try {
      const path = await ipc.getSamplePackPath();
      await openSource(path);
    } catch {
      pushToast("Demo pack not found", "error");
    }
  }, [openSource, pushToast]);

  return {
    opening,
    openSource,
    openJar,
    openFolder,
    openDemoPack,
    subscribeSourceEvents,
  };
}
