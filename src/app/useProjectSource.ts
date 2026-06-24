import { useCallback, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { getCatalogEntry, rebuildProjectCatalog } from "../app/services/catalogService";
import { bumpProjectDataRevision, invalidateProjectCaches } from "../app/projectDataRevision";
import { clearTextureDocuments } from "../features/editor/textureDocument";
import { useCatalogStore, snapshotCatalogState, restoreCatalogState } from "../features/catalog/catalogStore";
import { clearTextureCache } from "../features/viewer3d/textureLoader";
import { formatIpcError } from "../ipc/errors";
import { ipc } from "../ipc/client";
import type { IndexEvent } from "../ipc/types";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";

const OPEN_GRACE_MS = 5000;
const RELOAD_DEBOUNCE_MS = 800;
const CACHE_INVALIDATE_DEBOUNCE_MS = 300;

async function recoverEmptyCatalog(
  handle: { id: number },
  onEvent: Channel<IndexEvent>,
  pushToast: (message: string, kind: "success" | "error" | "info") => void,
): Promise<void> {
  const language = useSettingsStore.getState().catalogLanguage;
  pushToast("Catalog empty — rebuilding index and catalog…", "info");
  try {
    await ipc.invalidateProjectIndex(handle);
    await ipc.reindexProject(handle, onEvent, null);
    await rebuildProjectCatalog(handle, language);
    bumpProjectDataRevision();
    pushToast("Catalog rebuilt", "success");
  } catch (error) {
    pushToast(`Catalog rebuild failed: ${formatIpcError(error)}`, "error");
  }
}

async function rebuildCatalogIfNeeded(
  handle: { id: number },
  language: string,
  catalogLanguageOnOpen: string | undefined,
  pushToast: (message: string, kind: "success" | "error" | "info") => void,
): Promise<void> {
  if (!language || language === catalogLanguageOnOpen) return;
  try {
    await rebuildProjectCatalog(handle, language);
  } catch (error) {
    pushToast(`Catalog language rebuild failed: ${formatIpcError(error)}`, "error");
  }
}

export function useProjectSource(onBeforeOpen?: () => void) {
  const [opening, setOpening] = useState(false);
  const openRequestIdRef = useRef(0);
  const handle = useProjectStore((s) => s.handle);
  const addRecentProject = useSettingsStore((s) => s.addRecentProject);
  const catalogLanguage = useSettingsStore((s) => s.catalogLanguage);
  const setLastSessionPath = useSettingsStore((s) => s.setLastSessionPath);
  const clearProject = useProjectStore((s) => s.clearProject);
  const finishOpen = useProjectStore((s) => s.finishOpen);
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

      const hadOpenProject = Boolean(handle);
      const catalogSnapshot = hadOpenProject ? snapshotCatalogState() : null;
      const studioSelectedSnapshot = hadOpenProject
        ? useSettingsStore.getState().studioSelectedCatalogId
        : null;

      setOpening(true);
      setIndexStatus("running");
      setIndexProgress(0, 1, "starting");

      const applyIndexEvent = (event: IndexEvent) => {
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

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        if (openRequestIdRef.current !== requestId) {
          return;
        }
        applyIndexEvent(event);
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

        const previousHandle = useProjectStore.getState().handle;
        if (previousHandle) {
          try {
            await ipc.closeSource(previousHandle);
          } catch {
            // ignore stale handle cleanup errors
          }
          clearTextureCache(previousHandle);
          onBeforeOpen?.();
        }

        clearProject();
        clearSelection();
        clearTextureDocuments();
        invalidateProjectCaches({ thumbnails: true, icons: true, studio: true });
        useCatalogStore.getState().reset();
        useSettingsStore.getState().setStudioSelectedCatalogId(null);

        setHandle(result);
        finishOpen(result);
        if (result.entryCount > 0 && (result.catalogEntryCount ?? 0) === 0) {
          await recoverEmptyCatalog(result.handle, onEvent, pushToast);
        }
        await rebuildCatalogIfNeeded(
          result.handle,
          catalogLanguage,
          result.catalogLanguage,
          pushToast,
        );
        bumpProjectDataRevision();
        useCatalogStore.getState().setCategory(null);
        useCatalogStore.getState().setSearch("");
        useSettingsStore.getState().setStudioCatalogCategory(null);
        addRecentProject(result.sourcePath, result.sourceKind);
        setLastSessionPath(result.sourcePath);
        const settings = useSettingsStore.getState();
        if (settings.workspaceMode === "studio") {
          settings.completeStudioOnboarding();
        } else {
          settings.completeOnboarding();
        }
        const catalogNote =
          result.catalogEntryCount > 0
            ? ` · ${result.catalogEntryCount.toLocaleString()} catalog`
            : "";
        const cacheNote =
          result.catalogFromCache && result.fromCache
            ? " (index + catalog cache)"
            : result.catalogFromCache
              ? " (catalog cache)"
              : result.fromCache
                ? " (index cache)"
                : "";
        pushToast(
          `Opened ${result.entryCount.toLocaleString()} assets${catalogNote}${cacheNote}`,
          result.catalogEntryCount > 0 || result.entryCount === 0 ? "success" : "info",
        );
        return true;
      } catch (error) {
        if (openRequestIdRef.current !== requestId) {
          return false;
        }
        if (catalogSnapshot) {
          restoreCatalogState(catalogSnapshot);
          useSettingsStore.getState().setStudioSelectedCatalogId(studioSelectedSnapshot);
          setIndexStatus("done");
        } else {
          clearProject();
          clearSelection();
          clearTextureDocuments();
          setIndexStatus("error");
        }
        pushToast(`Failed to open: ${formatIpcError(error)}`, "error");
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
      catalogLanguage,
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
    const pendingPaths = new Set<string>();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    let cacheInvalidateTimer: ReturnType<typeof setTimeout> | undefined;
    let openedAt = 0;
    let reindexGeneration = 0;
    let reindexInFlight = false;
    let reindexQueued: string[] | "full" | null = null;

    const reindexCurrent = async (changedPaths?: string[]) => {
      const generation = ++reindexGeneration;
      const currentHandle = useProjectStore.getState().handle;
      if (!currentHandle) return false;

      if (reindexInFlight) {
        if (!changedPaths?.length) {
          reindexQueued = "full";
        } else if (reindexQueued !== "full") {
          reindexQueued = [...new Set([...(reindexQueued ?? []), ...changedPaths])];
        }
        return false;
      }
      reindexInFlight = true;

      const incremental = changedPaths && changedPaths.length > 0;
      setIndexStatus("running");
      setIndexProgress(0, 1, incremental ? "patching" : "reindexing");

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        if (generation !== reindexGeneration) return;
        switch (event.type) {
          case "started":
            setIndexProgress(0, event.total, incremental ? "patching" : "reindexing");
            break;
          case "progress":
            setIndexProgress(event.scanned, event.total, event.stage);
            break;
          case "done":
            setIndexProgress(100, 100, event.fromCache ? "from cache" : incremental ? "patched" : "reindexed");
            break;
          case "warning":
            setIndexProgress(0, 0, `${event.path}: ${event.reason}`);
            break;
          default:
            break;
        }
      };

      try {
        const reindex = await ipc.reindexProject(
          currentHandle,
          onEvent,
          incremental ? changedPaths : null,
        );
        if (generation !== reindexGeneration) return false;
        const activeHandle = useProjectStore.getState().handle;
        if (!activeHandle || activeHandle.id !== currentHandle.id) return false;

        const language = useSettingsStore.getState().catalogLanguage;
        finishOpen({
          handle: currentHandle,
          sourcePath: useProjectStore.getState().sourcePath ?? "",
          sourceKind: useProjectStore.getState().sourceKind ?? "folder",
          entryCount: reindex.assetCount,
          fromCache: false,
          catalogFromCache: false,
          catalogEntryCount: reindex.catalogCount,
          packFormat: null,
          catalogLanguage: language,
        });
        await rebuildCatalogIfNeeded(currentHandle, language, undefined, pushToast);
        bumpProjectDataRevision();
        const selectedId = useCatalogStore.getState().selectedId;
        if (selectedId) {
          try {
            const entry = await getCatalogEntry(currentHandle, selectedId);
            useCatalogStore.getState().selectEntry(entry);
          } catch {
            useCatalogStore.getState().clearSelection();
          }
        }
        if (!incremental) {
          clearTextureCache(currentHandle);
          invalidateProjectCaches({ thumbnails: true, icons: true });
        } else {
          invalidateProjectCaches({ thumbnails: true });
        }
        setIndexStatus("done");
        pushToast(
          incremental
            ? `Updated ${changedPaths!.length} changed file(s)`
            : `Reindexed ${reindex.assetCount.toLocaleString()} assets`,
          "success",
        );
        return true;
      } catch {
        if (generation !== reindexGeneration) return false;
        const stillOpen = useProjectStore.getState().handle;
        if (stillOpen && stillOpen.id === currentHandle.id) {
          setIndexStatus("done");
        } else {
          setIndexStatus("error");
        }
        pushToast(incremental ? "Failed to patch project" : "Failed to reindex project", "error");
        return false;
      } finally {
        reindexInFlight = false;
        if (reindexQueued !== null) {
          const queued = reindexQueued;
          reindexQueued = null;
          void reindexCurrent(queued === "full" ? undefined : queued);
        }
      }
    };

    const scheduleReload = (path: string) => {
      pendingPaths.add(path.replace(/\\/g, "/"));
      if (!reloadPending) {
        reloadPending = true;
        pushToast(`Source changed: ${path.split(/[\\/]/).pop()} — reloading…`, "info");
      }
      if (reloadTimer) clearTimeout(reloadTimer);

      const graceRemaining =
        openedAt > 0 ? Math.max(0, OPEN_GRACE_MS - (Date.now() - openedAt)) : 0;
      const delay = graceRemaining + RELOAD_DEBOUNCE_MS;

      reloadTimer = setTimeout(() => {
        reloadPending = false;
        reloadTimer = undefined;
        const paths = [...pendingPaths];
        pendingPaths.clear();
        const currentHandle = useProjectStore.getState().handle;
        if (!currentHandle) return;
        const needsFull = paths.some((p) => /\.(jar|zip)$/i.test(p));
        void reindexCurrent(needsFull ? undefined : paths);
      }, delay);
    };

    void ipc
      .onSourceChanged(({ path }) => {
        scheduleReload(path);
      })
      .then((fn) => {
        unlistenChanged = fn;
      });

    void ipc
      .onCacheInvalidated(() => {
        if (cacheInvalidateTimer) clearTimeout(cacheInvalidateTimer);
        cacheInvalidateTimer = setTimeout(() => {
          cacheInvalidateTimer = undefined;
          clearTextureCache();
          invalidateProjectCaches({ thumbnails: true });
        }, CACHE_INVALIDATE_DEBOUNCE_MS);
      })
      .then((fn) => {
        unlistenInvalidated = fn;
      });

    const unsubOpen = useProjectStore.subscribe((state, prev) => {
      if (state.handle && state.handle !== prev.handle) {
        openedAt = Date.now();
        reindexGeneration += 1;
      }
    });
    if (useProjectStore.getState().handle) {
      openedAt = Date.now();
    }

    return () => {
      reindexGeneration += 1;
      if (reloadTimer) clearTimeout(reloadTimer);
      if (cacheInvalidateTimer) clearTimeout(cacheInvalidateTimer);
      unsubOpen();
      unlistenChanged?.();
      unlistenInvalidated?.();
    };
  }, [pushToast, finishOpen, setIndexProgress, setIndexStatus]);

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
