import { useCallback, useEffect, useRef } from "react";

import { getCatalogEntry } from "../../app/services/catalogService";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import { catalogCategoryCount } from "./catalogUtils";
import { useCatalogSelection } from "./useCatalogSelection";

/** Restores persisted studio category/selection and runs first-entry auto-select. */
export function useCatalogSessionRestore() {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const entries = useCatalogStore((s) => s.entries);
  const category = useCatalogStore((s) => s.category);
  const facets = useCatalogStore((s) => s.facets);
  const catalogLoading = useCatalogStore((s) => s.loading);
  const selectedId = useCatalogStore((s) => s.selectedId);
  const sessionRestorePending = useCatalogStore((s) => s.sessionRestorePending);
  const setCategory = useCatalogStore((s) => s.setCategory);
  const setFocusIndex = useCatalogStore((s) => s.setFocusIndex);
  const setSessionRestorePending = useCatalogStore((s) => s.setSessionRestorePending);
  const studioSelectedCatalogId = useSettingsStore((s) => s.studioSelectedCatalogId);
  const studioCatalogCategory = useSettingsStore((s) => s.studioCatalogCategory);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);

  const sessionRestoredRef = useRef(false);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const { selectEntry } = useCatalogSelection();

  useEffect(() => {
    restoreAbortRef.current?.abort();
    restoreAbortRef.current = new AbortController();
    sessionRestoredRef.current = false;
    setSessionRestorePending(true);
    return () => {
      restoreAbortRef.current?.abort();
    };
  }, [handle?.id, setSessionRestorePending]);

  const finishSessionRestore = useCallback(() => {
    sessionRestoredRef.current = true;
    setSessionRestorePending(false);
  }, [setSessionRestorePending]);

  useEffect(() => {
    if (!sessionRestorePending || sessionRestoredRef.current) return;
    if (indexStatus === "error") {
      finishSessionRestore();
    }
  }, [indexStatus, sessionRestorePending, finishSessionRestore]);

  useEffect(() => {
    if (!studioSelectedCatalogId && !studioCatalogCategory) {
      finishSessionRestore();
    }
  }, [handle?.id, studioSelectedCatalogId, studioCatalogCategory, finishSessionRestore]);

  useEffect(() => {
    if (sessionRestoredRef.current || !sessionRestorePending) return;

    if (studioCatalogCategory && category !== studioCatalogCategory) {
      if (!facets) return;
      if (catalogCategoryCount(facets, studioCatalogCategory) > 0) {
        setCategory(studioCatalogCategory);
      } else {
        setStudioCatalogCategory(null);
        finishSessionRestore();
      }
      return;
    }

    if (!entries.length && !studioSelectedCatalogId) return;

    if (studioSelectedCatalogId) {
      const idx = entries.findIndex((e) => e.id === studioSelectedCatalogId);
      if (idx >= 0) {
        setFocusIndex(idx);
        if (!useCatalogStore.getState().selectedEntry) {
          selectEntry(entries[idx]!);
        }
        finishSessionRestore();
        return;
      }

      if (!handle) {
        if (indexStatus === "done" || indexStatus === "error") {
          finishSessionRestore();
        }
        return;
      }

      const signal = restoreAbortRef.current?.signal;
      let cancelled = false;
      void getCatalogEntry(handle, studioSelectedCatalogId)
        .then((entry) => {
          if (cancelled || signal?.aborted || sessionRestoredRef.current) return;
          selectEntry(entry);
          finishSessionRestore();
        })
        .catch(() => {
          if (!cancelled && !signal?.aborted) finishSessionRestore();
        });

      return () => {
        cancelled = true;
      };
    }

    finishSessionRestore();
  }, [
    entries,
    facets,
    handle,
    indexStatus,
    studioSelectedCatalogId,
    studioCatalogCategory,
    category,
    sessionRestorePending,
    setCategory,
    setStudioCatalogCategory,
    setFocusIndex,
    selectEntry,
    finishSessionRestore,
  ]);

  useEffect(() => {
    if (sessionRestoredRef.current || !sessionRestorePending) return;
    if (!handle || indexStatus !== "done" || catalogLoading) return;
    if (studioSelectedCatalogId || studioCatalogCategory) return;
    finishSessionRestore();
  }, [
    handle,
    indexStatus,
    catalogLoading,
    sessionRestorePending,
    studioSelectedCatalogId,
    studioCatalogCategory,
    finishSessionRestore,
  ]);

  useEffect(() => {
    if (workspaceMode !== "studio" || sessionRestorePending || selectedId) return;
    if (!entries.length) return;
    selectEntry(entries[0]!);
  }, [workspaceMode, sessionRestorePending, selectedId, entries, selectEntry]);
}
