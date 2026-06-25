import { useEffect, useRef } from "react";

import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import { catalogCategoryCount, catalogTotalCount } from "./catalogUtils";

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
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const setCategory = useCatalogStore((s) => s.setCategory);
  const setSearch = useCatalogStore((s) => s.setSearch);
  const sessionRestorePending = useCatalogStore((s) => s.sessionRestorePending);
  const studioSelectedCatalogId = useSettingsStore((s) => s.studioSelectedCatalogId);
  const studioCatalogCategory = useSettingsStore((s) => s.studioCatalogCategory);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);

  const clearedFilterForPackRef = useRef<number | null>(null);
  const refreshedStaleQueryRef = useRef<number | null>(null);

  useEffect(() => {
    clearedFilterForPackRef.current = null;
    refreshedStaleQueryRef.current = null;
  }, [handle?.id]);

  useEffect(() => {
    if (!enabled || workspaceMode !== "studio" || !handle || indexStatus !== "done" || loading) {
      return;
    }

    if (sessionRestorePending) {
      return;
    }

    const facetTotal = catalogTotalCount(facets);
    const hasFilter =
      category != null ||
      search.trim().length > 0 ||
      namespaceFilter.trim().length > 0;

    if (
      !hasFilter &&
      total > 0 &&
      entries.length === 0 &&
      refreshedStaleQueryRef.current !== handle.id
    ) {
      refreshedStaleQueryRef.current = handle.id;
      refreshCatalogCaches();
      return;
    }

    if (
      hasFilter &&
      total === 0 &&
      entries.length === 0 &&
      facets &&
      facetTotal > 0 &&
      clearedFilterForPackRef.current !== handle.id
    ) {
      const categoryStale =
        category != null && catalogCategoryCount(facets, category) === 0;
      const searchStale = search.trim().length > 0;
      const namespaceStale = namespaceFilter.trim().length > 0;
      if (!categoryStale && !searchStale && !namespaceStale) {
        return;
      }
      clearedFilterForPackRef.current = handle.id;
      if (categoryStale) {
        setCategory(null);
        setStudioCatalogCategory(null);
      }
      if (searchStale) {
        setSearch("");
      }
      if (namespaceStale) {
        useProjectStore.getState().setNamespaceFilter("");
      }
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
    namespaceFilter,
    setCategory,
    setSearch,
    setStudioCatalogCategory,
  ]);
}

/** @deprecated Use `useCatalogFilterRecovery` — selection lives in CatalogPanel. */
export const useCatalogAutoSelect = useCatalogFilterRecovery;
