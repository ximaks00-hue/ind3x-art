import { useEffect, useRef } from "react";

import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import { catalogTotalCount } from "./catalogUtils";

/**
 * Clears stale category/search filters when the pack has entries but the current filter hides them.
 * Initial catalog selection is owned by CatalogPanel session-restore orchestration.
 */
export function useCatalogFilterRecovery(enabled = true) {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const entries = useCatalogStore((s) => s.entries);
  const total = useCatalogStore((s) => s.total);
  const facets = useCatalogStore((s) => s.facets);
  const category = useCatalogStore((s) => s.category);
  const search = useCatalogStore((s) => s.search);
  const loading = useCatalogStore((s) => s.loading);
  const setCategory = useCatalogStore((s) => s.setCategory);
  const setSearch = useCatalogStore((s) => s.setSearch);
  const sessionRestorePending = useCatalogStore((s) => s.sessionRestorePending);
  const studioSelectedCatalogId = useSettingsStore((s) => s.studioSelectedCatalogId);
  const studioCatalogCategory = useSettingsStore((s) => s.studioCatalogCategory);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);

  const clearedFilterForPackRef = useRef<number | null>(null);

  useEffect(() => {
    clearedFilterForPackRef.current = null;
  }, [handle?.id]);

  useEffect(() => {
    if (!enabled || workspaceMode !== "studio") return;
    if (!studioSelectedCatalogId && !studioCatalogCategory) {
      useCatalogStore.getState().setSessionRestorePending(false);
    }
  }, [enabled, workspaceMode, studioSelectedCatalogId, studioCatalogCategory]);

  useEffect(() => {
    if (!enabled || workspaceMode !== "studio" || !handle || indexStatus !== "done" || loading) {
      return;
    }

    if (
      sessionRestorePending &&
      entries.length === 0 &&
      (studioSelectedCatalogId != null || studioCatalogCategory != null)
    ) {
      return;
    }

    const facetTotal = catalogTotalCount(facets);
    const hasFilter = category != null || search.trim().length > 0;
    if (facetTotal > 0 && hasFilter && clearedFilterForPackRef.current !== handle.id) {
      clearedFilterForPackRef.current = handle.id;
      setCategory(null);
      setSearch("");
      setStudioCatalogCategory(null);
      refreshCatalogCaches();
      return;
    }

    if (total > 0 && entries.length === 0 && clearedFilterForPackRef.current !== handle.id) {
      clearedFilterForPackRef.current = handle.id;
      refreshCatalogCaches();
    }
  }, [
    enabled,
    workspaceMode,
    handle,
    indexStatus,
    loading,
    sessionRestorePending,
    studioSelectedCatalogId,
    studioCatalogCategory,
    entries,
    total,
    facets,
    category,
    search,
    setCategory,
    setSearch,
    setStudioCatalogCategory,
  ]);
}

/** @deprecated Use `useCatalogFilterRecovery` — selection lives in CatalogPanel. */
export const useCatalogAutoSelect = useCatalogFilterRecovery;
