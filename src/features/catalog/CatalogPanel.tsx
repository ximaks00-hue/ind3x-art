import { useCallback, useEffect, useMemo, useRef } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { CatalogCategoryTabs } from "./CatalogCategoryTabs";
import { CatalogGridToolbar } from "./CatalogGridToolbar";
import { CatalogQuickRow } from "./CatalogQuickRow";
import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { CatalogSearch } from "./CatalogSearch";
import { CatalogVirtualGrid } from "./CatalogVirtualGrid";
import styles from "./CatalogPanel.module.css";
import { flushCatalogSearchDebounce, useCatalogStore } from "./catalogStore";
import {
  catalogCategoryCount,
  catalogTotalCount,
  CATALOG_CATEGORY_LABELS,
} from "./catalogUtils";
import { useCatalogIconPendingCount } from "./useCatalogIconPipeline";
import { useCatalogKeyboardNav } from "./useCatalogKeyboardNav";
import { useCatalogLoadMore } from "./useCatalogQuery";
import { useCatalogQuickEntries } from "./useCatalogQuickEntries";
import { useCatalogSelection } from "./useCatalogSelection";
import { useCatalogSessionRestore } from "./useCatalogSessionRestore";
import { PanelErrorBoundary } from "../../ui/PanelErrorBoundary/PanelErrorBoundary";

export function CatalogPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const studioFocusDoneRef = useRef(false);

  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const sourcePath = useProjectStore((s) => s.sourcePath);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const setFuzzySearch = useProjectStore((s) => s.setFuzzySearch);
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const setNamespaceFilter = useProjectStore((s) => s.setNamespaceFilter);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const pinnedCatalogIds = useSettingsStore((s) => s.pinnedCatalogIds);
  const recentCatalogIds = useSettingsStore((s) => s.recentCatalogIds);
  const togglePinnedCatalogId = useSettingsStore((s) => s.togglePinnedCatalogId);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);
  const explorerFocusTick = useUiStore((s) => s.explorerFocusTick);

  const entries = useCatalogStore((s) => s.entries);
  const total = useCatalogStore((s) => s.total);
  const loading = useCatalogStore((s) => s.loading);
  const hasMore = useCatalogStore((s) => s.hasMore);
  const search = useCatalogStore((s) => s.search);
  const category = useCatalogStore((s) => s.category);
  const facets = useCatalogStore((s) => s.facets);
  const facetsError = useCatalogStore((s) => s.facetsError);
  const queryError = useCatalogStore((s) => s.queryError);
  const selectedId = useCatalogStore((s) => s.selectedId);
  const focusIndex = useCatalogStore((s) => s.focusIndex);
  const setSearch = useCatalogStore((s) => s.setSearch);
  const setCategory = useCatalogStore((s) => s.setCategory);
  const setFocusIndex = useCatalogStore((s) => s.setFocusIndex);
  const refreshCatalog = refreshCatalogCaches;

  const { selectEntry } = useCatalogSelection();
  const { loadMore, searchPending } = useCatalogLoadMore();
  const iconPending = useCatalogIconPendingCount();

  useCatalogSessionRestore();

  const quickIds = useMemo(
    () => [...new Set([...pinnedCatalogIds, ...recentCatalogIds])],
    [pinnedCatalogIds, recentCatalogIds],
  );
  const quickEntryMap = useCatalogQuickEntries(handle, quickIds);
  const pinnedEntries = useMemo(
    () =>
      pinnedCatalogIds
        .map((id) => quickEntryMap.get(id))
        .filter((e): e is CatalogEntry => Boolean(e)),
    [pinnedCatalogIds, quickEntryMap],
  );
  const recentEntries = useMemo(
    () =>
      recentCatalogIds
        .filter((id) => !pinnedCatalogIds.includes(id))
        .map((id) => quickEntryMap.get(id))
        .filter((e): e is CatalogEntry => Boolean(e)),
    [recentCatalogIds, pinnedCatalogIds, quickEntryMap],
  );
  const pinnedIdSet = useMemo(() => new Set(pinnedCatalogIds), [pinnedCatalogIds]);

  useEffect(() => {
    if (explorerFocusTick > 0) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [explorerFocusTick]);

  useEffect(() => {
    if (
      workspaceMode === "studio" &&
      indexStatus === "done" &&
      handle &&
      !studioFocusDoneRef.current
    ) {
      studioFocusDoneRef.current = true;
      panelRef.current?.focus();
    }
    if (workspaceMode !== "studio") {
      studioFocusDoneRef.current = false;
    }
  }, [workspaceMode, indexStatus, handle]);

  useCatalogKeyboardNav({
    panelRef,
    searchRef,
    entries,
    focusIndex,
    setFocusIndex,
    selectEntry,
    scrollToRow: (row) => {
      const el = scrollRef.current;
      if (!el) return;
      const targetTop = row * 48;
      el.scrollTo({ top: targetTop, behavior: "auto" });
    },
  });

  useEffect(() => {
    if (!facets || category == null) return;
    if (catalogCategoryCount(facets, category) === 0) {
      setCategory(null);
      setStudioCatalogCategory(null);
    }
  }, [facets, category, setCategory, setStudioCatalogCategory]);

  useEffect(() => {
    if (category != null) setStudioCatalogCategory(category);
  }, [category, setStudioCatalogCategory]);

  const handleTogglePin = useCallback(
    (entry: { id: string }) => {
      togglePinnedCatalogId(entry.id);
    },
    [togglePinnedCatalogId],
  );

  const handleSelect = useCallback(
    (entry: (typeof entries)[number], index: number) => {
      setFocusIndex(index);
      selectEntry(entry);
    },
    [setFocusIndex, selectEntry],
  );

  const shownCount = total > 0 ? Math.min(entries.length, total) : entries.length;
  const isLoading = loading || searchPending;
  const showNoMatches =
    !queryError && entries.length === 0 && !isLoading && indexStatus === "done" && handle;
  const allCatalogCount = catalogTotalCount(facets);
  const hasActiveFilter = Boolean(category) || search.trim().length > 0;

  const clearCatalogFilters = useCallback(() => {
    setSearch("");
    setCategory(null);
    setStudioCatalogCategory(null);
    flushCatalogSearchDebounce();
    refreshCatalog();
  }, [setSearch, setCategory, setStudioCatalogCategory, refreshCatalog]);

  return (
    <PanelErrorBoundary name="Catalog">
    <div
      ref={panelRef}
      className={styles.panel}
      data-tour="tour-catalog hint-catalog"
      tabIndex={-1}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Catalog</h2>
        <p className={styles.subtitle}>
          {queryError
            ? "Catalog load failed"
            : indexStatus === "done"
              ? `${shownCount.toLocaleString()} loaded · ${total.toLocaleString()} total`
              : indexStatus === "running"
                ? "Indexing…"
                : "Open a pack to browse blocks"}
        </p>
        {iconPending > 50 ? (
          <p className={styles.bakingProgress}>Baking icons… ({iconPending} pending)</p>
        ) : null}
        {sourcePath ? <p className={styles.sourcePath}>{sourcePath}</p> : null}
      </div>

      <CatalogSearch
        value={search}
        onChange={setSearch}
        namespace={namespaceFilter}
        onNamespaceChange={setNamespaceFilter}
        disabled={!handle}
        inputRef={searchRef}
        fuzzySearch={fuzzySearch}
        onFuzzySearchChange={setFuzzySearch}
      />

      <CatalogCategoryTabs
        facets={facets}
        facetsError={facetsError}
        active={category}
        onSelect={setCategory}
      />

      {handle && indexStatus === "done" ? <CatalogGridToolbar /> : null}

      {pinnedEntries.length > 0 ? (
        <CatalogQuickRow
          label="Pinned"
          entries={pinnedEntries}
          pinnedIds={pinnedIdSet}
          selectedId={selectedId}
          onSelect={selectEntry}
          onTogglePin={handleTogglePin}
        />
      ) : null}

      {recentEntries.length > 0 ? (
        <CatalogQuickRow
          label="Recent"
          entries={recentEntries}
          pinnedIds={pinnedIdSet}
          selectedId={selectedId}
          onSelect={selectEntry}
          onTogglePin={handleTogglePin}
        />
      ) : null}

      <div ref={scrollRef} className={styles.scroll}>
        {!handle || indexStatus !== "done" ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Creative catalog</p>
            <p className={styles.emptyBody}>
              Open a resource pack or try the demo pack to browse blocks and items like
              Minecraft&apos;s creative inventory.
            </p>
          </div>
        ) : queryError ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Catalog failed to load</p>
            <p className={styles.emptyBody}>{queryError}</p>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => refreshCatalog()}
            >
              Retry
            </button>
          </div>
        ) : showNoMatches ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No matches</p>
            <p className={styles.emptyBody}>
              {search.trim()
                ? "Try a different search or clear the filters."
                : category
                  ? `No entries in ${CATALOG_CATEGORY_LABELS[category]}.`
                  : allCatalogCount === 0
                    ? "This pack has no catalog entries yet."
                    : "No entries match the current filters."}
            </p>
            {hasActiveFilter ? (
              <button type="button" className={styles.retryBtn} onClick={clearCatalogFilters}>
                Show all items
              </button>
            ) : null}
          </div>
        ) : (
          <CatalogVirtualGrid
            scrollRef={scrollRef}
            entries={entries}
            selectedId={selectedId}
            focusIndex={focusIndex}
            pinnedIdSet={pinnedIdSet}
            hasMore={hasMore}
            loading={isLoading}
            onSelect={handleSelect}
            onTogglePin={handleTogglePin}
            loadMore={loadMore}
          />
        )}
        {isLoading ? <p className={styles.loading}>Loading…</p> : null}
      </div>
    </div>
    </PanelErrorBoundary>
  );
}
