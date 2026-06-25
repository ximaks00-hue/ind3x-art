import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { CatalogEntry } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { CatalogCell } from "./CatalogCell";
import styles from "./CatalogPanel.module.css";
import { CATALOG_GRID_COLS, catalogRowCount, catalogRowHeight } from "./catalogUtils";
import { useCatalogIconPipeline } from "./useCatalogIconPipeline";

const ICON_PREFETCH_ROWS = 1;

interface CatalogVirtualGridProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  entries: CatalogEntry[];
  selectedId: string | null;
  focusIndex: number;
  pinnedIdSet: Set<string>;
  hasMore: boolean;
  loading: boolean;
  onSelect: (entry: CatalogEntry, index: number) => void;
  onTogglePin: (entry: CatalogEntry) => void;
  loadMore: () => void;
}

export function CatalogVirtualGrid({
  scrollRef,
  entries,
  selectedId,
  focusIndex,
  pinnedIdSet,
  hasMore,
  loading,
  onSelect,
  onTogglePin,
  loadMore,
}: CatalogVirtualGridProps) {
  const showLabels = useSettingsStore((s) => s.catalogShowCellLabels);
  const rowHeight = catalogRowHeight(showLabels);
  const rowCount = catalogRowCount(entries.length);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: ICON_PREFETCH_ROWS,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [showLabels, rowHeight, virtualizer]);

  const scrollOffset = virtualizer.scrollOffset;
  const virtualRangeKey = useMemo(() => {
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return `${rowCount}:${rowHeight}:empty`;
    const first = items[0]!.index;
    const last = items[items.length - 1]!.index;
    return `${rowCount}:${rowHeight}:${first}:${last}`;
  }, [virtualizer, rowCount, rowHeight, scrollOffset]);

  const virtualItems = virtualizer.getVirtualItems();

  const visibleEntries = useMemo(() => {
    const indices = new Set<number>();
    for (const item of virtualizer.getVirtualItems()) {
      for (let rowOffset = -ICON_PREFETCH_ROWS; rowOffset <= ICON_PREFETCH_ROWS; rowOffset++) {
        const row = item.index + rowOffset;
        if (row < 0 || row >= rowCount) continue;
        const start = row * CATALOG_GRID_COLS;
        for (let col = 0; col < CATALOG_GRID_COLS; col++) {
          const idx = start + col;
          if (idx < entries.length) indices.add(idx);
        }
      }
    }
    return [...indices]
      .sort((a, b) => a - b)
      .map((i) => entries[i])
      .filter((e): e is CatalogEntry => Boolean(e));
  }, [virtualRangeKey, entries, rowCount, virtualizer]);

  useCatalogIconPipeline(visibleEntries, selectedId, entries);

  const loadingMoreRef = useRef(false);
  const loadMoreRowRef = useRef(-1);

  useEffect(() => {
    if (!loading) {
      loadingMoreRef.current = false;
      loadMoreRowRef.current = -1;
    }
  }, [loading]);

  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    const last = items[items.length - 1];
    if (!last || !hasMore || loading || loadingMoreRef.current) return;
    if (last.index >= rowCount - ICON_PREFETCH_ROWS) {
      if (loadMoreRowRef.current === last.index) return;
      loadMoreRowRef.current = last.index;
      loadingMoreRef.current = true;
      loadMore();
    }
  }, [virtualRangeKey, hasMore, loading, loadMore, rowCount, virtualizer]);

  return (
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
            role="row"
            aria-rowindex={virtualRow.index + 1}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
              height: virtualRow.size,
            }}
          >
            {Array.from({ length: CATALOG_GRID_COLS }, (_, col) => {
              const index = rowStart + col;
              const entry = entries[index];
              if (!entry) {
                return <span key={col} className={styles.cellGap} role="presentation" />;
              }
              return (
                <CatalogCell
                  key={entry.id}
                  entry={entry}
                  columnIndex={col}
                  rowIndex={virtualRow.index}
                  showLabels={showLabels}
                  selected={selectedId === entry.id}
                  focused={focusIndex === index}
                  pinned={pinnedIdSet.has(entry.id)}
                  onClick={() => onSelect(entry, index)}
                  onTogglePin={() => onTogglePin(entry)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
