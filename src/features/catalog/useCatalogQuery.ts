import { useCallback, useEffect, useRef } from "react";

import { getCatalogFacets, queryCatalog } from "../../app/services/catalogService";
import type { CatalogFilter } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { useCatalogStore } from "./catalogStore";

export const CATALOG_PAGE_SIZE = 180;

function catalogFilterKey(filter: CatalogFilter): string {
  return JSON.stringify(filter);
}

export function useCatalogQuery() {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const category = useCatalogStore((s) => s.category);
  const debouncedSearch = useCatalogStore((s) => s.debouncedSearch);
  const search = useCatalogStore((s) => s.search);
  const loading = useCatalogStore((s) => s.loading);
  const hasMore = useCatalogStore((s) => s.hasMore);
  const queryRevision = useCatalogStore((s) => s.queryRevision);
  const setQueryPage = useCatalogStore((s) => s.setQueryPage);
  const setQueryLoading = useCatalogStore((s) => s.setQueryLoading);
  const setQueryError = useCatalogStore((s) => s.setQueryError);
  const setFacets = useCatalogStore((s) => s.setFacets);
  const setFacetsError = useCatalogStore((s) => s.setFacetsError);
  const resetQuery = useCatalogStore((s) => s.resetQuery);
  const pushToast = useUiStore((s) => s.pushToast);

  const requestId = useRef(0);

  const buildFilter = useCallback((): CatalogFilter => {
    return {
      category: category ?? null,
      namespace: null,
      search: debouncedSearch.trim() || null,
      fuzzy: fuzzySearch,
    };
  }, [category, debouncedSearch, fuzzySearch]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!handle) return;
      const id = ++requestId.current;
      const handleId = handle.id;
      const filter = buildFilter();
      const filterKey = catalogFilterKey(filter);
      setQueryLoading(true);
      try {
        const page = await queryCatalog(handle, filter, {
          offset,
          limit: CATALOG_PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        const project = useProjectStore.getState();
        if (!project.handle || project.handle.id !== handleId) return;
        const current = useCatalogStore.getState();
        if (catalogFilterKey({
          category: current.category ?? null,
          namespace: null,
          search: current.debouncedSearch.trim() || null,
          fuzzy: project.fuzzySearch,
        }) !== filterKey) {
          return;
        }
        setQueryPage(page.entries, page.total, append, offset);
      } catch (error) {
        if (id !== requestId.current) return;
        const message =
          error instanceof Error ? error.message : "Failed to load catalog";
        setQueryError(message);
        pushToast(`Catalog query failed: ${message}`, "error");
      } finally {
        if (id === requestId.current) setQueryLoading(false);
      }
    },
    [handle, buildFilter, setQueryPage, setQueryLoading, setQueryError, pushToast],
  );

  useEffect(() => {
    if (!handle || indexStatus !== "done") {
      if (!handle) useCatalogStore.getState().reset();
      return;
    }
    resetQuery();
    void fetchPage(0, false);
  }, [handle, indexStatus, category, debouncedSearch, queryRevision, fetchPage, resetQuery]);

  useEffect(() => {
    if (!handle || indexStatus !== "done") {
      setFacets(null);
      setFacetsError(null);
      return;
    }
    let cancelled = false;
    void getCatalogFacets(handle)
      .then((facets) => {
        if (!cancelled) setFacets(facets);
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load category counts";
        setFacets(null);
        setFacetsError(message);
        pushToast(`Catalog facets failed: ${message}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [handle, indexStatus, queryRevision, setFacets, setFacetsError, pushToast]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const offset = useCatalogStore.getState().offset;
    void fetchPage(offset, true);
  }, [hasMore, loading, fetchPage]);

  const searchPending = search.trim() !== debouncedSearch.trim();

  return { loadMore, loading, hasMore, searchPending, retry: () => void fetchPage(0, false) };
}
