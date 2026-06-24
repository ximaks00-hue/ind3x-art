import { useCallback, useEffect, useRef } from "react";

import type { AssetFilter, AssetKind } from "../../ipc/types";
import { queryAssets } from "../../app/services/assetService";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";

export const EXPLORER_PAGE_SIZE = 200;

export function useAssetQuery(debouncedSearch: string) {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const kindFilter = useProjectStore((s) => s.kindFilter);
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const queryLoading = useProjectStore((s) => s.queryLoading);
  const queryHasMore = useProjectStore((s) => s.queryHasMore);
  const setQueryPage = useProjectStore((s) => s.setQueryPage);
  const setQueryLoading = useProjectStore((s) => s.setQueryLoading);
  const queryRevision = useProjectStore((s) => s.queryRevision);
  const resetQuery = useProjectStore((s) => s.resetQuery);
  const pushToast = useUiStore((s) => s.pushToast);

  const requestId = useRef(0);

  const buildFilter = useCallback((): AssetFilter => {
    return {
      kind: kindFilter === "all" ? null : (kindFilter as AssetKind),
      namespace: namespaceFilter || null,
      search: debouncedSearch.trim() || null,
      fuzzy: fuzzySearch,
    };
  }, [kindFilter, namespaceFilter, debouncedSearch, fuzzySearch]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!handle) return;
      const id = ++requestId.current;
      const handleId = handle.id;
      const filter = buildFilter();
      const filterKey = JSON.stringify(filter);
      setQueryLoading(true);
      try {
        const page = await queryAssets(handle, filter, {
          offset,
          limit: EXPLORER_PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        const current = useProjectStore.getState();
        if (!current.handle || current.handle.id !== handleId) return;
        const currentFilterKey = JSON.stringify({
          kind: current.kindFilter === "all" ? null : (current.kindFilter as AssetKind),
          namespace: current.namespaceFilter || null,
          search: debouncedSearch.trim() || null,
          fuzzy: current.fuzzySearch,
        });
        if (currentFilterKey !== filterKey) return;
        setQueryPage(page.entries, page.total, append, offset);

        if (
          !append &&
          page.entries.length > 0 &&
          !useProjectStore.getState().selectedAsset &&
          useSettingsStore.getState().workspaceMode === "classic"
        ) {
          const previewable = page.entries.find(
            (e) =>
              e.kind === "texture" ||
              e.kind === "blockModel" ||
              e.kind === "itemModel" ||
              e.kind === "blockstate",
          );
          if (previewable) {
            useProjectStore.getState().selectAsset(previewable);
          }
        }
      } catch (error) {
        if (id !== requestId.current) return;
        const message = error instanceof Error ? error.message : "Failed to load assets";
        pushToast(`Explorer query failed: ${message}`, "error");
      } finally {
        if (id === requestId.current) setQueryLoading(false);
      }
    },
    [handle, buildFilter, debouncedSearch, setQueryPage, setQueryLoading, pushToast],
  );

  useEffect(() => {
    if (!handle || indexStatus !== "done") return;
    resetQuery();
    void fetchPage(0, false);
  }, [
    handle,
    indexStatus,
    kindFilter,
    namespaceFilter,
    debouncedSearch,
    fuzzySearch,
    queryRevision,
    fetchPage,
    resetQuery,
  ]);

  const loadMore = useCallback(() => {
    if (!queryHasMore || queryLoading) return;
    const offset = useProjectStore.getState().queryOffset;
    void fetchPage(offset, true);
  }, [queryHasMore, queryLoading, fetchPage]);

  return {
    loadMore,
    queryLoading,
    queryHasMore,
    refresh: () => void fetchPage(0, false),
  };
}
