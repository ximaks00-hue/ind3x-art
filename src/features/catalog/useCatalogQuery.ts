import { useCallback, useEffect, useRef } from "react";

import { getCatalogFacets, queryCatalog, rebuildProjectCatalog } from "../../app/services/catalogService";
import { refreshCatalogCaches } from "../../app/projectDataRevision";
import type { CatalogFilter } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { useCatalogStore } from "./catalogStore";
import { catalogTotalCount } from "./catalogUtils";

export const CATALOG_PAGE_SIZE = 180;

function catalogFilterKey(filter: CatalogFilter): string {
  return JSON.stringify(filter);
}

const catalogQueryApi = {
  loadMore: () => {},
};

/** Pagination helpers for CatalogPanel (query runs via useCatalogBootstrap in App). */
export function useCatalogLoadMore() {
  const loading = useCatalogStore((s) => s.loading);
  const hasMore = useCatalogStore((s) => s.hasMore);
  const search = useCatalogStore((s) => s.search);
  const debouncedSearch = useCatalogStore((s) => s.debouncedSearch);
  return {
    loadMore: () => catalogQueryApi.loadMore(),
    loading,
    hasMore,
    searchPending: search.trim() !== debouncedSearch.trim(),
  };
}

export function useCatalogQuery(enabled = true) {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const category = useCatalogStore((s) => s.category);
  const facets = useCatalogStore((s) => s.facets);
  const total = useCatalogStore((s) => s.total);
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
  const catalogLanguage = useSettingsStore((s) => s.catalogLanguage);

  const requestId = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const rebuildAttemptedRef = useRef(false);
  const lastQueryKeyRef = useRef<string | null>(null);

  const buildFilter = useCallback((): CatalogFilter => {
    return {
      category: category ?? null,
      namespace: namespaceFilter.trim() || null,
      search: debouncedSearch.trim() || null,
      fuzzy: fuzzySearch,
    };
  }, [category, namespaceFilter, debouncedSearch, fuzzySearch]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!handle) return;
      const id = ++requestId.current;
      const handleId = handle.id;
      const filter = buildFilter();
      const filterKey = catalogFilterKey(filter);
      fetchAbortRef.current?.abort();
      const fetchAbort = new AbortController();
      fetchAbortRef.current = fetchAbort;
      setQueryLoading(true);
      try {
        const needFacets = !append && !useCatalogStore.getState().facets;
        const pagePromise = queryCatalog(handle, filter, {
          offset,
          limit: CATALOG_PAGE_SIZE,
        }, { signal: fetchAbort.signal });
        const facetsPromise = needFacets
          ? getCatalogFacets(handle).catch((error) => {
              if (id !== requestId.current) return null;
              const message =
                error instanceof Error ? error.message : "Failed to load category counts";
              setFacets(null);
              setFacetsError(message);
              pushToast(`Catalog facets failed: ${message}`, "error");
              return null;
            })
          : Promise.resolve(null);

        const [page, facetsResult] = await Promise.all([pagePromise, facetsPromise]);
        if (id !== requestId.current) return;
        if (facetsResult) setFacets(facetsResult);
        const project = useProjectStore.getState();
        if (!project.handle || project.handle.id !== handleId) return;
        const current = useCatalogStore.getState();
        if (
          catalogFilterKey({
            category: current.category ?? null,
            namespace: useProjectStore.getState().namespaceFilter.trim() || null,
            search: current.debouncedSearch.trim() || null,
            fuzzy: project.fuzzySearch,
          }) !== filterKey
        ) {
          return;
        }
        setQueryPage(page.entries, page.total, append, offset);

        if (!append && page.entries.length > 0) {
          useCatalogStore.getState().setSessionRestorePending(false);
        }

        if (
          !append &&
          page.total === 0 &&
          !rebuildAttemptedRef.current &&
          filter.category == null &&
          !filter.search?.trim()
        ) {
          const assetTotal = useProjectStore.getState().assetTotal;
          const facetsTotal = catalogTotalCount(useCatalogStore.getState().facets);
          if (assetTotal > 0 || facetsTotal > 0) {
            rebuildAttemptedRef.current = true;
            void rebuildProjectCatalog({ id: handleId }, catalogLanguage)
              .then(() => {
                refreshCatalogCaches();
              })
              .catch(() => {
                rebuildAttemptedRef.current = false;
              });
          }
        }
      } catch (error) {
        if (id !== requestId.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = error instanceof Error ? error.message : "Failed to load catalog";
        setQueryError(message);
        pushToast(`Catalog query failed: ${message}`, "error");
      } finally {
        if (id === requestId.current) setQueryLoading(false);
      }
    },
    [handle, buildFilter, setQueryPage, setQueryLoading, setQueryError, setFacets, setFacetsError, pushToast, catalogLanguage],
  );

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    return () => {
      requestId.current += 1;
      fetchAbortRef.current?.abort();
    };
  }, [handle?.id]);

  useEffect(() => {
    if (!enabled) return;
    rebuildAttemptedRef.current = false;
  }, [enabled, handle?.id]);

  // Facets can arrive after the first empty query (category restore / IPC ordering).
  useEffect(() => {
    if (!enabled || !handle || indexStatus !== "done" || total > 0 || loading) return;
    if (category != null || debouncedSearch.trim()) return;
    if (catalogTotalCount(facets) === 0) return;
    // Primary query effect already owns the first fetch for this filter key.
    if (lastQueryKeyRef.current !== null) return;
    void fetchPageRef.current(0, false);
  }, [enabled, handle, indexStatus, total, loading, facets, category, debouncedSearch]);

  useEffect(() => {
    if (!enabled || !handle || indexStatus !== "done") {
      if (!handle) {
        useCatalogStore.getState().reset();
        lastQueryKeyRef.current = null;
      } else if (indexStatus === "running") {
        resetQuery();
      }
      return;
    }
    const queryKey = `${handle.id}:${category ?? ""}:${namespaceFilter.trim()}:${debouncedSearch}:${fuzzySearch}:${queryRevision}`;
    if (lastQueryKeyRef.current === queryKey) return;
    lastQueryKeyRef.current = queryKey;
    resetQuery();
    void fetchPageRef.current(0, false);
  }, [enabled, handle, indexStatus, category, namespaceFilter, debouncedSearch, fuzzySearch, queryRevision, resetQuery]);

  useEffect(() => {
    if (!enabled || !handle || indexStatus !== "done") {
      setFacets(null);
      setFacetsError(null);
      return;
    }
    if (!useCatalogStore.getState().facets) return;
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
  }, [enabled, handle, indexStatus, queryRevision, setFacets, setFacetsError, pushToast]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const offset = useCatalogStore.getState().offset;
    void fetchPage(offset, true);
  }, [hasMore, loading, fetchPage]);

  catalogQueryApi.loadMore = loadMore;

  const searchPending = search.trim() !== debouncedSearch.trim();

  return {
    loadMore,
    loading,
    hasMore,
    searchPending,
    retry: () => void fetchPage(0, false),
  };
}
