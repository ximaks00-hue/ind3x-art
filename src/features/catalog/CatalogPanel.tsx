import { AlertTriangle, Package, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { Icon } from "../../ui/icons/Icon";
import { Button } from "../../ui/primitives";
import { PanelErrorBoundary } from "../../ui/PanelErrorBoundary/PanelErrorBoundary";
import { Spinner } from "../../ui/primitives/Spinner";
import { CatalogCategoryTabs } from "./CatalogCategoryTabs";
import { CatalogGridSkeleton } from "./CatalogGridSkeleton";
import { CatalogQuickRow } from "./CatalogQuickRow";
import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { CatalogSearch } from "./CatalogSearch";
import { CatalogVirtualGrid } from "./CatalogVirtualGrid";
import styles from "./CatalogPanel.module.css";
import { flushCatalogSearchDebounce, useCatalogStore } from "./catalogStore";
import {
  catalogCategoryCount,
  catalogRowHeight,
  catalogRowCount,
  catalogTotalCount,
  CATALOG_CATEGORY_LABELS,
  CATALOG_GRID_COLS,
} from "./catalogUtils";
import { useCatalogIconPendingCount } from "./useCatalogIconPipeline";
import { useCatalogKeyboardNav } from "./useCatalogKeyboardNav";
import { useCatalogLoadMore } from "./useCatalogQuery";
import { useCatalogQuickEntries } from "./useCatalogQuickEntries";
import { useCatalogSelection } from "./useCatalogSelection";
import { useCatalogSessionRestore } from "./useCatalogSessionRestore";
import { useCatalogLanguageSwitch } from "./useCatalogLanguageSwitch";

const CATALOG_GRID_ID = "catalog-items-grid";

export function CatalogPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const studioFocusDoneRef = useRef(false);

  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const setFuzzySearch = useProjectStore((s) => s.setFuzzySearch);
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const setNamespaceFilter = useProjectStore((s) => s.setNamespaceFilter);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const pinnedCatalogIds = useSettingsStore((s) => s.pinnedCatalogIds);
  const recentCatalogIds = useSettingsStore((s) => s.recentCatalogIds);
  const catalogShowCellLabels = useSettingsStore((s) => s.catalogShowCellLabels);
  const setCatalogShowCellLabels = useSettingsStore((s) => s.setCatalogShowCellLabels);
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
  const { catalogLanguage, switchLanguage, busy: languageBusy } = useCatalogLanguageSwitch();
  const rowHeight = catalogRowHeight(catalogShowCellLabels);

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
      el.scrollTo({ top: row * rowHeight, behavior: "auto" });
    },
  });

  useEffect(() => {
    if (!facets) return;
    if (category == null) {
      if (useSettingsStore.getState().studioCatalogCategory !== null) {
        setStudioCatalogCategory(null);
      }
      return;
    }
    if (catalogCategoryCount(facets, category) === 0) {
      if (useCatalogStore.getState().category !== null) setCategory(null);
      if (useSettingsStore.getState().studioCatalogCategory !== null) {
        setStudioCatalogCategory(null);
      }
      return;
    }
    if (useSettingsStore.getState().studioCatalogCategory !== category) {
      setStudioCatalogCategory(category);
    }
  }, [facets, category, setCategory, setStudioCatalogCategory]);

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
  const showSkeleton =
    isLoading && entries.length === 0 && handle && indexStatus === "done" && !queryError;
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
        <div className={styles.headerRow}>
          <h2 className={styles.title}>Catalog</h2>
          {indexStatus === "done" && handle ? (
            <span className={styles.headerMeta}>
              {queryError
                ? "Load failed"
                : `${shownCount.toLocaleString()} / ${total.toLocaleString()}`}
            </span>
          ) : null}
        </div>
        {iconPending > 50 ? (
          <p className={styles.bakingProgress}>
            <span className="status-dot status-dot--breathe" aria-hidden />
            Baking icons… ({iconPending} pending)
          </p>
        ) : null}
      </div>

      <CatalogSearch
        value={search}
        onChange={setSearch}
        namespace={namespaceFilter}
        onNamespaceChange={setNamespaceFilter}
        disabled={!handle}
        searchPending={searchPending}
        inputRef={searchRef}
        fuzzySearch={fuzzySearch}
        onFuzzySearchChange={setFuzzySearch}
        showLabels={catalogShowCellLabels}
        onShowLabelsChange={setCatalogShowCellLabels}
        catalogLanguage={catalogLanguage}
        onCatalogLanguageChange={(language) => void switchLanguage(language)}
        languageBusy={languageBusy}
      />

      <CatalogCategoryTabs
        facets={facets}
        facetsError={facetsError}
        active={category}
        onSelect={setCategory}
        gridId={CATALOG_GRID_ID}
      />

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
          <div className="empty-state" role="status" aria-live="polite">
            <span className={styles.emptyIcon} aria-hidden>
              <Icon icon={Package} size={20} />
            </span>
            <p className="empty-state-title">Creative catalog</p>
            <p className="empty-state-body">
              Open a resource pack or try the demo pack to browse blocks and items like
              Minecraft&apos;s creative inventory.
            </p>
          </div>
        ) : queryError ? (
          <div className="empty-state" role="alert" aria-live="polite">
            <span className={`${styles.emptyIcon} ${styles.emptyIconDanger}`} aria-hidden>
              <Icon icon={AlertTriangle} size={20} />
            </span>
            <p className="empty-state-title">Catalog failed to load</p>
            <p className="empty-state-body">{queryError}</p>
            <Button variant="ghost" onClick={() => refreshCatalog()}>
              Retry
            </Button>
          </div>
        ) : showNoMatches ? (
          <div className="empty-state" role="status" aria-live="polite">
            <span className={styles.emptyIcon} aria-hidden>
              <Icon icon={SearchX} size={20} />
            </span>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-body">
              {search.trim()
                ? "Try a different search or clear the filters."
                : category
                  ? `No entries in ${CATALOG_CATEGORY_LABELS[category]}.`
                  : allCatalogCount === 0
                    ? "This pack has no catalog entries yet."
                    : "No entries match the current filters."}
            </p>
            {hasActiveFilter ? (
              <Button variant="ghost" onClick={clearCatalogFilters}>
                Show all items
              </Button>
            ) : null}
          </div>
        ) : showSkeleton ? (
          <CatalogGridSkeleton showLabels={catalogShowCellLabels} />
        ) : (
          <div
            className={styles.grid}
            id={CATALOG_GRID_ID}
            role="grid"
            aria-label="Catalog items"
            aria-rowcount={catalogRowCount(entries.length)}
            aria-colcount={CATALOG_GRID_COLS}
          >
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
          </div>
        )}
        {isLoading && entries.length > 0 ? (
          <div className={styles.loadingBar} role="status">
            <Spinner label="Loading catalog" />
            <span>Loading…</span>
          </div>
        ) : null}
      </div>
    </div>
    </PanelErrorBoundary>
  );
}
