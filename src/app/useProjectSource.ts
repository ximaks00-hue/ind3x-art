import { useCallback, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { getCatalogEntry, rebuildProjectCatalog } from "../app/services/catalogService";
import { bumpProjectDataRevision, invalidateProjectCaches } from "../app/projectDataRevision";
import { transitionToWorkspaceMode } from "../app/useWorkspaceMode";
import { clearTextureDocuments } from "../features/editor/textureDocument";
import { useCatalogStore, snapshotCatalogState, restoreCatalogState } from "../features/catalog/catalogStore";
import { clearTextureCache } from "../features/viewer3d/textureLoader";
import { formatIpcError } from "../ipc/errors";
import { subscribeIndexEvents } from "../ipc/indexEvents";
import { ipc } from "../ipc/client";
import type { IndexEvent, ProjectHandle } from "../ipc/types";
import { useEditorStore } from "../state/editorStore";
import { useInteractionStore } from "../state/interactionStore";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";
import { useViewerStore } from "../state/viewerStore";

const OPEN_GRACE_MS = 5000;
const RELOAD_DEBOUNCE_MS = 800;
const CACHE_INVALIDATE_DEBOUNCE_MS = 300;

async function cleanupProjectHandle(handle: ProjectHandle): Promise<void> {
  try {
    await ipc.cancelIndex(handle);
  } catch (error) {
    console.debug("[project] cancelIndex on stale handle", handle.id, error);
  }
  try {
    await ipc.closeSource(handle);
  } catch (error) {
    console.debug("[project] closeSource on stale handle", handle.id, error);
  }
}

async function recoverEmptyCatalog(
  handle: ProjectHandle,
  onEvent: Channel<IndexEvent>,
  pushToast: (message: string, kind: "success" | "error" | "info") => void,
  isStale: () => boolean,
): Promise<boolean> {
  if (isStale()) return false;
  const language = useSettingsStore.getState().catalogLanguage;
  pushToast("Catalog empty — rebuilding index and catalog…", "info");
  try {
    await ipc.invalidateProjectIndex(handle);
    if (isStale()) return false;
    await ipc.reindexProject(handle, onEvent, null);
    if (isStale()) return false;
    await rebuildProjectCatalog(handle, language);
    if (isStale()) return false;
    bumpProjectDataRevision();
    pushToast("Catalog rebuilt", "success");
    return true;
  } catch (error) {
    if (!isStale()) {
      pushToast(`Catalog rebuild failed: ${formatIpcError(error)}`, "error");
    }
    return false;
  }
}

async function rebuildCatalogIfNeeded(
  handle: ProjectHandle,
  language: string,
  catalogLanguageOnOpen: string | undefined,
  pushToast: (message: string, kind: "success" | "error" | "info") => void,
  isStale: () => boolean,
): Promise<boolean> {
  if (!language || language === catalogLanguageOnOpen) return true;
  if (isStale()) return false;
  try {
    await rebuildProjectCatalog(handle, language);
    return !isStale();
  } catch (error) {
    if (!isStale()) {
      pushToast(`Catalog language rebuild failed: ${formatIpcError(error)}`, "error");
    }
    return false;
  }
}

export function useProjectSource(onBeforeOpen?: () => void) {
  const [opening, setOpening] = useState(false);
  const openRequestIdRef = useRef(0);
  const inFlightOpenHandleRef = useRef<ProjectHandle | null>(null);
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
      const previousInFlight = inFlightOpenHandleRef.current;
      if (previousInFlight) {
        await cleanupProjectHandle(previousInFlight);
        inFlightOpenHandleRef.current = null;
      }

      const requestId = openRequestIdRef.current + 1;
      openRequestIdRef.current = requestId;
      const isStale = () => openRequestIdRef.current !== requestId;

      const hadOpenProject = Boolean(handle);
      const catalogSnapshot = hadOpenProject ? snapshotCatalogState() : null;
      const studioSelectedSnapshot = hadOpenProject
        ? useSettingsStore.getState().studioSelectedCatalogId
        : null;

      const previousHandle = useProjectStore.getState().handle;
      if (previousHandle) {
        try {
          await cleanupProjectHandle(previousHandle);
        } catch (error) {
          console.warn("[project] failed to close previous handle before open", error);
        }
        clearTextureCache(previousHandle);
        onBeforeOpen?.();
      }

      setOpening(true);
      setIndexStatus("running");
      setIndexProgress(0, 1, "starting");

      const applyIndexEvent = (event: IndexEvent) => {
        if (isStale()) {
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

      const onEvent = new Channel<IndexEvent>();
      onEvent.onmessage = (event) => {
        applyIndexEvent(event);
      };

      let openedHandle: ProjectHandle | null = null;
      const unlistenIndex = await subscribeIndexEvents(applyIndexEvent);

      try {
        const result = await ipc.openSource(path, onEvent);
        openedHandle = result.handle;
        inFlightOpenHandleRef.current = result.handle;

        const currentMode = useSettingsStore.getState().workspaceMode;
        if (result.sourceKind === "folder" && currentMode === "studio") {
          transitionToWorkspaceMode("classic");
          pushToast("Folder sources open in Classic mode. Switched automatically.", "info");
        }

        if (isStale()) {
          await cleanupProjectHandle(result.handle);
          inFlightOpenHandleRef.current = null;
          return false;
        }

        clearProject();
        clearSelection();
        clearTextureDocuments();
        invalidateProjectCaches({ thumbnails: true, icons: true, studio: true });
        useCatalogStore.getState().reset();
        useSettingsStore.getState().setStudioSelectedCatalogId(null);
        useEditorStore.getState().resetEditorSession();
        useInteractionStore.getState().resetInteractionState();
        useViewerStore.getState().clearActiveTextureMeta();

        setHandle(result);
        finishOpen(result);

        if (result.entryCount > 0 && (result.catalogEntryCount ?? 0) === 0) {
          const recovered = await recoverEmptyCatalog(result.handle, onEvent, pushToast, isStale);
          if (!recovered && isStale()) {
            await cleanupProjectHandle(result.handle);
            inFlightOpenHandleRef.current = null;
            return false;
          }
        }

        if (isStale()) {
          await cleanupProjectHandle(result.handle);
          inFlightOpenHandleRef.current = null;
          return false;
        }

        const rebuilt = await rebuildCatalogIfNeeded(
          result.handle,
          catalogLanguage,
          result.catalogLanguage,
          pushToast,
          isStale,
        );
        if (!rebuilt) {
          await cleanupProjectHandle(result.handle);
          inFlightOpenHandleRef.current = null;
          return false;
        }

        if (isStale()) {
          await cleanupProjectHandle(result.handle);
          inFlightOpenHandleRef.current = null;
          return false;
        }

        inFlightOpenHandleRef.current = null;
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
        if (openedHandle) {
          await cleanupProjectHandle(openedHandle);
          inFlightOpenHandleRef.current = null;
        }
        if (isStale()) {
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
          useEditorStore.getState().resetEditorSession();
          useInteractionStore.getState().resetInteractionState();
          useViewerStore.getState().clearActiveTextureMeta();
          setIndexStatus("error");
        }
        pushToast(`Failed to open: ${formatIpcError(error)}`, "error");
        return false;
      } finally {
        unlistenIndex();
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
    let disposed = false;
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

    const registerListener = (
      setup: () => Promise<() => void>,
      assign: (unlisten: () => void) => void,
    ) => {
      void setup()
        .then((unlisten) => {
          if (disposed) {
            unlisten();
            return;
          }
          assign(unlisten);
        })
        .catch((error) => {
          console.warn("[project] source event listener registration failed", error);
        });
    };

    const reindexCurrent = async (changedPaths?: string[]) => {
      if (disposed) return false;

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
        if (disposed || generation !== reindexGeneration) return;
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

      const applyReindexEvent = (event: IndexEvent) => {
        if (disposed || generation !== reindexGeneration) return;
        onEvent.onmessage?.(event);
      };
      const unlistenIndex = await subscribeIndexEvents(applyReindexEvent);

      try {
        const reindex = await ipc.reindexProject(
          currentHandle,
          onEvent,
          incremental ? changedPaths : null,
        );
        if (disposed || generation !== reindexGeneration) return false;
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
        await rebuildCatalogIfNeeded(
          currentHandle,
          language,
          undefined,
          pushToast,
          () => disposed || generation !== reindexGeneration,
        );
        if (disposed || generation !== reindexGeneration) return false;
        bumpProjectDataRevision();
        const selectedId = useCatalogStore.getState().selectedId;
        if (selectedId) {
          try {
            const entry = await getCatalogEntry(currentHandle, selectedId);
            if (!disposed && generation === reindexGeneration) {
              useCatalogStore.getState().selectEntry(entry);
            }
          } catch (error) {
            console.warn(
              "[project] failed to refresh catalog selection after reindex",
              selectedId,
              error,
            );
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
      } catch (error) {
        console.warn("[project] reindex failed", { incremental, pathCount: changedPaths?.length }, error);
        if (disposed || generation !== reindexGeneration) return false;
        const stillOpen = useProjectStore.getState().handle;
        if (stillOpen && stillOpen.id === currentHandle.id) {
          setIndexStatus("done");
        } else {
          setIndexStatus("error");
        }
        pushToast(incremental ? "Failed to patch project" : "Failed to reindex project", "error");
        return false;
      } finally {
        unlistenIndex();
        reindexInFlight = false;
        if (disposed) {
          reindexQueued = null;
          return;
        }
        if (reindexQueued !== null) {
          const queued = reindexQueued;
          reindexQueued = null;
          void reindexCurrent(queued === "full" ? undefined : queued);
        }
      }
    };

    const scheduleReload = (path: string) => {
      if (disposed) return;
      console.debug("[project] source changed, scheduling reindex", path);
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
        if (disposed) return;
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

    registerListener(
      () =>
        ipc.onSourceChanged(({ path }) => {
          scheduleReload(path);
        }),
      (fn) => {
        unlistenChanged = fn;
      },
    );

    registerListener(
      () =>
        ipc.onCacheInvalidated(() => {
          if (disposed) return;
          if (cacheInvalidateTimer) clearTimeout(cacheInvalidateTimer);
          cacheInvalidateTimer = setTimeout(() => {
            if (disposed) return;
            cacheInvalidateTimer = undefined;
            console.debug("[project] cache-invalidated — clearing viewer textures and thumbnails");
            clearTextureCache();
            invalidateProjectCaches({ thumbnails: true });
          }, CACHE_INVALIDATE_DEBOUNCE_MS);
        }),
      (fn) => {
        unlistenInvalidated = fn;
      },
    );

    const unsubOpen = useProjectStore.subscribe((state, prev) => {
      if (state.handle && state.handle !== prev.handle) {
        openedAt = Date.now();
        reindexGeneration += 1;
        reindexQueued = null;
      }
    });
    if (useProjectStore.getState().handle) {
      openedAt = Date.now();
    }

    return () => {
      disposed = true;
      reindexGeneration += 1;
      reindexQueued = null;
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
    if (useSettingsStore.getState().workspaceMode === "studio") {
      transitionToWorkspaceMode("classic");
      pushToast("Studio supports JAR only. Switching to Classic for folder source.", "info");
    }
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (typeof selected === "string") {
      await openSource(selected);
    }
  }, [openSource, pushToast]);

  const openDemoPack = useCallback(async () => {
    try {
      const path = await ipc.getSamplePackPath();
      await openSource(path);
    } catch (error) {
      console.warn("[project] demo pack not found", error);
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
