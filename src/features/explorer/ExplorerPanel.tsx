import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { getAssetFacets, revealAssetInFolder } from "../../app/services/explorerService";
import type { AssetEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { ContextMenu, type ContextMenuItem } from "../../ui/ContextMenu/ContextMenu";
import { ExplorerAssetList } from "./ExplorerAssetList";
import { ExplorerHeader } from "./ExplorerHeader";
import {
  buildFlatRows,
  buildFilesystemRows,
  buildGroupedRows,
  type ExplorerRow,
} from "./buildTree";
import { FacetBar } from "./FacetBar";
import { InspectorPanel } from "./InspectorPanel";
import styles from "./ExplorerPanel.module.css";
import { useAssetQuery } from "./useAssetQuery";
import { useExplorerInspector } from "./useExplorerInspector";
import { useThumbnailBatchPrefetch } from "./useThumbnailBatchPrefetch";

function assetRows(rows: ExplorerRow[]): ExplorerRow[] {
  return rows.filter((r): r is ExplorerRow & { type: "asset" } => r.type === "asset");
}

export function ExplorerPanel({
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: {
  onOpenJar?: () => void;
  onOpenFolder?: () => void;
  onOpenRecent?: (path: string, kind: "jar" | "folder") => void;
  onTryDemo?: () => void;
} = {}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboardScopeActiveRef = useRef(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: AssetEntry;
  } | null>(null);
  const [focusRowIndex, setFocusRowIndex] = useState(0);

  const explorerFocusTick = useUiStore((s) => s.explorerFocusTick);
  const handle = useProjectStore((s) => s.handle);
  const assets = useProjectStore((s) => s.assets);
  const assetTotal = useProjectStore((s) => s.queryTotal);
  const queryLoading = useProjectStore((s) => s.queryLoading);
  const queryHasMore = useProjectStore((s) => s.queryHasMore);
  const facets = useProjectStore((s) => s.facets);
  const sourcePath = useProjectStore((s) => s.sourcePath);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const kindFilter = useProjectStore((s) => s.kindFilter);
  const namespaceFilter = useProjectStore((s) => s.namespaceFilter);
  const search = useProjectStore((s) => s.search);
  const fuzzySearch = useProjectStore((s) => s.fuzzySearch);
  const viewMode = useProjectStore((s) => s.viewMode);
  const collapsedGroups = useProjectStore((s) => s.collapsedGroups);
  const selectedAssetId = useProjectStore((s) => s.selectedAssetId);
  const validationById = useProjectStore((s) => s.validationById);
  const setFacets = useProjectStore((s) => s.setFacets);
  const queryRevision = useProjectStore((s) => s.queryRevision);
  const setKindFilter = useProjectStore((s) => s.setKindFilter);
  const setNamespaceFilter = useProjectStore((s) => s.setNamespaceFilter);
  const setSearch = useProjectStore((s) => s.setSearch);
  const setFuzzySearch = useProjectStore((s) => s.setFuzzySearch);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const toggleGroupCollapsed = useProjectStore((s) => s.toggleGroupCollapsed);
  const setAllGroupsCollapsed = useProjectStore((s) => s.setAllGroupsCollapsed);

  const pinnedAssetIds = useSettingsStore((s) => s.pinnedAssetIds);
  const recentAssetIds = useSettingsStore((s) => s.recentAssetIds);
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const togglePinnedAsset = useSettingsStore((s) => s.togglePinnedAsset);

  const { inspector, inspectorLoading, pickAsset, pickAssetById } =
    useExplorerInspector(handle);
  const { loadMore } = useAssetQuery(debouncedSearch);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (explorerFocusTick > 0) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [explorerFocusTick]);

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

  useEffect(() => {
    if (!handle) {
      setFacets(null);
      return;
    }
    const handleId = handle.id;
    let cancelled = false;
    void getAssetFacets(handle)
      .then((next) => {
        if (cancelled) return;
        if (useProjectStore.getState().handle?.id !== handleId) return;
        setFacets(next);
      })
      .catch(() => {
        if (!cancelled) setFacets(null);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, queryRevision, setFacets]);

  const collapsedSet = useMemo(
    () => new Set(Object.keys(collapsedGroups).filter((k) => collapsedGroups[k])),
    [collapsedGroups],
  );

  const rows: ExplorerRow[] = useMemo(() => {
    if (viewMode === "grouped") return buildGroupedRows(assets, collapsedSet);
    if (viewMode === "tree") return buildFilesystemRows(assets, collapsedSet);
    return buildFlatRows(assets);
  }, [assets, viewMode, collapsedSet]);

  const navigableRows = useMemo(() => assetRows(rows), [rows]);

  const navigableIndexByAssetId = useMemo(() => {
    const map = new Map<string, number>();
    navigableRows.forEach((row, index) => {
      if (row.type === "asset") map.set(row.entry.id, index);
    });
    return map;
  }, [navigableRows]);

  useEffect(() => {
    setFocusRowIndex((index) => {
      if (navigableRows.length === 0) return 0;
      return Math.min(index, navigableRows.length - 1);
    });
  }, [navigableRows.length]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === "group" ? 32 : 40),
    overscan: 16,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleTexturePaths = useMemo(() => {
    const paths: string[] = [];
    for (const vRow of virtualItems) {
      const row = rows[vRow.index];
      if (row?.type === "asset" && row.entry.kind === "texture") {
        paths.push(row.entry.path);
      }
    }
    return paths;
  }, [virtualItems, rows]);

  useThumbnailBatchPrefetch(visibleTexturePaths);

  useEffect(() => {
    const focused = navigableRows[focusRowIndex];
    if (!focused || focused.type !== "asset") return;
    const rowIndex = rows.findIndex(
      (row) => row.type === "asset" && row.entry.id === focused.entry.id,
    );
    if (rowIndex >= 0) {
      virtualizer.scrollToIndex(rowIndex, { align: "auto" });
    }
  }, [focusRowIndex, navigableRows, rows, virtualizer]);

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rows.length - 12 && queryHasMore && !queryLoading) {
      loadMore();
    }
  }, [virtualItems, rows.length, queryHasMore, queryLoading, loadMore]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!keyboardScopeActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (!navigableRows.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusRowIndex((i) => Math.min(i + 1, navigableRows.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusRowIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const row = navigableRows[focusRowIndex];
        if (row?.type === "asset") {
          event.preventDefault();
          pickAsset(row.entry);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigableRows, focusRowIndex, pickAsset]);

  const groupIds = useMemo(
    () => rows.filter((r) => r.type === "group").map((r) => r.id),
    [rows],
  );

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        { id: "select", label: "Open in viewer", icon: "↗" },
        { id: "copy-path", label: "Copy asset path", icon: "⎘" },
        { id: "reveal", label: "Open containing folder", icon: "📁" },
        {
          id: "find-models",
          label: "Find models using this",
          icon: "🔍",
          disabled: contextMenu.entry.kind !== "texture",
        },
        { id: "pin", label: "Pin favorite", icon: "★" },
        { id: "sep1", label: "", separator: true },
        {
          id: "copy-ns",
          label: `Namespace: ${contextMenu.entry.namespace}`,
          icon: "◻",
          disabled: true,
        },
      ]
    : [];

  const handleContextMenuSelect = useCallback(
    (id: string) => {
      if (!contextMenu || !handle) return;
      const { entry } = contextMenu;
      if (id === "select") pickAsset(entry);
      if (id === "copy-path") void navigator.clipboard.writeText(entry.path);
      if (id === "reveal") void revealAssetInFolder(handle, entry.path);
      if (id === "find-models" && entry.kind === "texture") {
        setKindFilter("blockModel");
        setSearch(entry.displayName);
      }
      if (id === "pin") togglePinnedAsset(entry.id);
    },
    [contextMenu, handle, pickAsset, setKindFilter, setSearch, togglePinnedAsset],
  );

  const shownCount = assetTotal > 0 ? Math.min(assets.length, assetTotal) : assets.length;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      data-tour="tour-explorer hint-explorer"
      tabIndex={-1}
    >
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}

      <ExplorerHeader
        viewMode={viewMode}
        indexStatus={indexStatus}
        shownCount={shownCount}
        assetTotal={assetTotal}
        queryLoading={queryLoading}
        sourcePath={sourcePath}
        onViewModeChange={setViewMode}
        onExpandAll={() => setAllGroupsCollapsed(false, groupIds)}
        onCollapseAll={() => setAllGroupsCollapsed(true, groupIds)}
      />

      {(pinnedAssetIds.length > 0 || recentAssetIds.length > 0) && (
        <div className={styles.quickSection}>
          {pinnedAssetIds.length > 0 && (
            <div className={styles.quickRow}>
              <span className={styles.quickLabel}>Pinned</span>
              {pinnedAssetIds.slice(0, 8).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={styles.quickChip}
                  onClick={() => void pickAssetById(id)}
                  title={id}
                >
                  ★
                </button>
              ))}
            </div>
          )}
          {recentAssetIds.length > 0 && (
            <div className={styles.quickRow}>
              <span className={styles.quickLabel}>Recent</span>
              {recentAssetIds.slice(0, 6).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={styles.quickChip}
                  onClick={() => void pickAssetById(id)}
                  title={id}
                >
                  {id.split(":").pop()?.split("/").pop() ?? id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.filters}>
        <input
          ref={searchRef}
          className={styles.search}
          type="search"
          placeholder="Search assets… (/ or Ctrl+F)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!handle}
        />
        <label className={styles.fuzzyToggle}>
          <input
            type="checkbox"
            checked={fuzzySearch}
            onChange={(e) => setFuzzySearch(e.target.checked)}
            disabled={!handle}
          />
          Fuzzy
        </label>
      </div>

      <FacetBar
        facets={facets}
        kindFilter={kindFilter}
        namespaceFilter={namespaceFilter}
        onKindSelect={setKindFilter}
        onNamespaceSelect={setNamespaceFilter}
      />

      <ExplorerAssetList
        parentRef={parentRef}
        handle={handle}
        indexStatus={indexStatus}
        rows={rows}
        navigableRows={navigableRows as (ExplorerRow & { type: "asset" })[]}
        navigableIndexByAssetId={navigableIndexByAssetId}
        virtualizer={virtualizer}
        virtualItems={virtualItems}
        queryLoading={queryLoading}
        viewMode={viewMode}
        collapsedGroups={collapsedGroups}
        selectedAssetId={selectedAssetId}
        focusRowIndex={focusRowIndex}
        validationById={validationById}
        pinnedAssetIds={pinnedAssetIds}
        recentProjects={recentProjects}
        onToggleGroup={toggleGroupCollapsed}
        onPickAsset={pickAsset}
        onContextMenu={(x, y, entry) => setContextMenu({ x, y, entry })}
        onOpenJar={onOpenJar}
        onOpenFolder={onOpenFolder}
        onOpenRecent={onOpenRecent}
        onTryDemo={onTryDemo}
      />

      <InspectorPanel
        details={inspector}
        loading={inspectorLoading}
        isFavorite={Boolean(inspector && pinnedAssetIds.includes(inspector.id))}
        onToggleFavorite={() => {
          if (inspector) togglePinnedAsset(inspector.id);
        }}
        onSelectRelated={(assetId) => {
          void pickAssetById(assetId);
        }}
      />
    </div>
  );
}
