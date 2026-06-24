import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { CatalogCategoryTabs } from "./CatalogCategoryTabs";
import { CatalogCell } from "./CatalogCell";
import { CatalogSearch } from "./CatalogSearch";
import styles from "./CatalogPanel.module.css";
import { useCatalogStore } from "./catalogStore";
import { CATALOG_GRID_COLS, catalogRowCount } from "./catalogUtils";
import { useCatalogIconPipeline, useCatalogIconPendingCount } from "./useCatalogIconPipeline";
import { useCatalogQuery } from "./useCatalogQuery";
import { useCatalogSelection } from "./useCatalogSelection";

const ROW_HEIGHT = 72;

export function CatalogPanel() {
  const parentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboardScopeActiveRef = useRef(false);
  const studioFocusDoneRef = useRef(false);

  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const sourcePath = useProjectStore((s) => s.sourcePath);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const setFuzzySearch = useProjectStore((s) => s.setFuzzySearch);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
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
  const bumpQueryRevision = useCatalogStore((s) => s.bumpQueryRevision);
  const recentAssetIds = useSettingsStore((s) => s.recentAssetIds);
  const studioSelectedCatalogId = useSettingsStore((s) => s.studioSelectedCatalogId);
  const studioCatalogCategory = useSettingsStore((s) => s.studioCatalogCategory);
  const setStudioCatalogCategory = useSettingsStore((s) => s.setStudioCatalogCategory);
  const sessionRestoredRef = useRef(false);

  const { selectEntry } = useCatalogSelection();
  const { loadMore, searchPending } = useCatalogQuery();
  const iconPending = useCatalogIconPendingCount();

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

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onFocusIn = () => {
      keyboardScopeActiveRef.current = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      keyboardScopeActiveRef.current = !!(next && panel.contains(next));
    };
    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    return () => {
      panel.removeEventListener("focusin", onFocusIn);
      panel.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const rowCount = catalogRowCount(entries.length);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleEntries = useMemo(() => {
    const indices = new Set<number>();
    for (const item of virtualItems) {
      const start = item.index * CATALOG_GRID_COLS;
      for (let col = 0; col < CATALOG_GRID_COLS; col++) {
        const idx = start + col;
        if (idx < entries.length) indices.add(idx);
      }
    }
    return [...indices]
      .sort((a, b) => a - b)
      .map((i) => entries[i])
      .filter((e): e is CatalogEntry => Boolean(e));
  }, [virtualItems, entries]);

  useCatalogIconPipeline(visibleEntries);

  useEffect(() => {
    if (sessionRestoredRef.current || !entries.length) return;
    if (studioCatalogCategory && category !== studioCatalogCategory) {
      setCategory(studioCatalogCategory);
      return;
    }
    if (studioSelectedCatalogId) {
      const idx = entries.findIndex((e) => e.id === studioSelectedCatalogId);
      if (idx >= 0) {
        setFocusIndex(idx);
        sessionRestoredRef.current = true;
      }
    }
  }, [
    entries,
    studioSelectedCatalogId,
    studioCatalogCategory,
    category,
    setCategory,
    setFocusIndex,
  ]);

  useEffect(() => {
    if (category != null) setStudioCatalogCategory(category);
  }, [category, setStudioCatalogCategory]);

  const recentEntries = useMemo(() => {
    if (!recentAssetIds.length || !entries.length) return [];
    return recentAssetIds
      .map((assetId) =>
        entries.find((e) => `${e.namespace}:${e.sourcePath}` === assetId || e.id === assetId),
      )
      .filter((e): e is CatalogEntry => Boolean(e))
      .slice(0, 8);
  }, [recentAssetIds, entries]);

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last || !hasMore || loading) return;
    if (last.index >= rowCount - 3) loadMore();
  }, [virtualItems, hasMore, loading, loadMore, rowCount]);

  const moveFocus = useCallback(
    (next: number) => {
      if (!entries.length) return;
      const clamped = Math.max(0, Math.min(entries.length - 1, next));
      setFocusIndex(clamped);
      const row = Math.floor(clamped / CATALOG_GRID_COLS);
      virtualizer.scrollToIndex(row, { align: "auto" });
    },
    [entries.length, setFocusIndex, virtualizer],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!keyboardScopeActiveRef.current || !entries.length) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFocus(focusIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFocus(focusIndex - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(focusIndex + CATALOG_GRID_COLS);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(focusIndex - CATALOG_GRID_COLS);
      } else if (event.key === "Home") {
        event.preventDefault();
        moveFocus(0);
      } else if (event.key === "End") {
        event.preventDefault();
        moveFocus(entries.length - 1);
      } else if (event.key === "Enter") {
        const entry = entries[focusIndex];
        if (entry) {
          event.preventDefault();
          selectEntry(entry);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, focusIndex, moveFocus, selectEntry]);

  useEffect(() => {
    if (focusIndex >= entries.length) {
      setFocusIndex(Math.max(0, entries.length - 1));
    }
  }, [entries.length, focusIndex, setFocusIndex]);

  const shownCount = total > 0 ? Math.min(entries.length, total) : entries.length;
  const isLoading = loading || searchPending;
  const showNoMatches =
    !queryError && entries.length === 0 && !isLoading && indexStatus === "done" && handle;

  return (
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

      {recentEntries.length > 0 ? (
        <div className={styles.recentRow} aria-label="Recent catalog picks">
          <span className={styles.recentLabel}>Recent</span>
          <div className={styles.recentChips}>
            {recentEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={styles.recentChip}
                onClick={() => selectEntry(entry)}
                title={entry.displayName}
              >
                {entry.displayName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={parentRef} className={styles.scroll}>
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
            <button type="button" className={styles.retryBtn} onClick={() => bumpQueryRevision()}>
              Retry
            </button>
          </div>
        ) : showNoMatches ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No matches</p>
            <p className={styles.emptyBody}>
              {search.trim()
                ? "Try a different search or clear the category filter."
                : "No entries in this category."}
            </p>
          </div>
        ) : (
          <div
            className={styles.virtualSpacer}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((virtualRow) => {
              const rowStart = virtualRow.index * CATALOG_GRID_COLS;
              return (
                <div
                  key={virtualRow.key}
                  className={styles.row}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: virtualRow.size,
                  }}
                >
                  {Array.from({ length: CATALOG_GRID_COLS }, (_, col) => {
                    const index = rowStart + col;
                    const entry = entries[index];
                    if (!entry) {
                      return <span key={col} className={styles.cellGap} />;
                    }
                    return (
                      <CatalogCell
                        key={entry.id}
                        entry={entry}
                        selected={selectedId === entry.id}
                        focused={focusIndex === index}
                        onClick={() => {
                          setFocusIndex(index);
                          selectEntry(entry);
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        {isLoading ? <p className={styles.loading}>Loading…</p> : null}
      </div>
    </div>
  );
}
