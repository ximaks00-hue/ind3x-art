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
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const entries = useCatalogStore((s) => s.entries);
  const category = useCatalogStore((s) => s.category);
  const facets = useCatalogStore((s) => s.facets);
  const selectedId = useCatalogStore((s) => s.selectedId);
  const sessionRestorePending = useCatalogStore((s) => s.sessionRestorePending);
  const setCategory = useCatalogStore((s) => s.setCategory);
  const setFocusIndex = useCatalogStore((s) => s.setFocusIndex);
  const setSessionRestorePending = useCatalogStore((s) => s.setSessionRestorePending);
  const studioSelectedCatalogId = useSettingsStore((s) => s.studioSelectedCatalogId);
  const studioCatalogCategory = useSettingsStore((s) => s.studioCatalogCategory);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);

  const sessionRestoredRef = useRef(false);
  const { selectEntry } = useCatalogSelection();

  useEffect(() => {
    sessionRestoredRef.current = false;
    setSessionRestorePending(true);
  }, [handle?.id, setSessionRestorePending]);

  const finishSessionRestore = useCallback(() => {
    sessionRestoredRef.current = true;
    setSessionRestorePending(false);
  }, [setSessionRestorePending]);

  useEffect(() => {
    if (!useCatalogStore.getState().sessionRestorePending) return;
    const timer = window.setTimeout(() => finishSessionRestore(), 1500);
    return () => window.clearTimeout(timer);
  }, [handle?.id, finishSessionRestore]);

  useEffect(() => {
    if (!studioSelectedCatalogId && !studioCatalogCategory) {
      finishSessionRestore();
    }
  }, [handle?.id, studioSelectedCatalogId, studioCatalogCategory, finishSessionRestore]);

  useEffect(() => {
    if (sessionRestoredRef.current) return;

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
      if (!handle) return;
      let cancelled = false;
      void getCatalogEntry(handle, studioSelectedCatalogId)
        .then((entry) => {
          if (cancelled || sessionRestoredRef.current) return;
          selectEntry(entry);
          finishSessionRestore();
        })
        .catch(() => {
          if (!cancelled) finishSessionRestore();
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
    studioSelectedCatalogId,
    studioCatalogCategory,
    category,
    setCategory,
    setStudioCatalogCategory,
    setFocusIndex,
    selectEntry,
    finishSessionRestore,
  ]);

  useEffect(() => {
    if (workspaceMode !== "studio" || sessionRestorePending || selectedId) return;
    if (!entries.length) return;
    selectEntry(entries[0]!);
  }, [workspaceMode, sessionRestorePending, selectedId, entries, selectEntry]);
}
