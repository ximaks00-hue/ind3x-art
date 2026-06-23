import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ipc } from "../../ipc/client";
import type { AssetEntry } from "../../ipc/types";
import { ASSET_KIND_LABELS } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useUiStore } from "../../state/uiStore";
import { ContextMenu, type ContextMenuItem } from "../../ui/ContextMenu/ContextMenu";
import { SkeletonBlock } from "../../ui/Skeleton/Skeleton";
import {
  buildFlatRows,
  buildFilesystemRows,
  buildGroupedRows,
  type ExplorerRow,
} from "./buildTree";
import { FacetBar } from "./FacetBar";
import { filterAssetsFuzzy } from "./fuzzy";
import styles from "./ExplorerPanel.module.css";
import { TextureThumbnail } from "./TextureThumbnail";

function applyFilters(
  assets: AssetEntry[],
  kindFilter: string,
  namespaceFilter: string,
  search: string,
  fuzzy: boolean,
): AssetEntry[] {
  let result = assets;
  if (kindFilter !== "all") {
    result = result.filter((e) => e.kind === kindFilter);
  }
  if (namespaceFilter) {
    result = result.filter((e) => e.namespace === namespaceFilter);
  }
  if (search.trim()) {
    result = filterAssetsFuzzy(result, search, fuzzy);
  }
  return result;
}

export function ExplorerPanel() {
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: AssetEntry;
  } | null>(null);
  const explorerFocusTick = useUiStore((s) => s.explorerFocusTick);

  const {
    handle,
    assets,
    assetTotal,
    facets,
    sourcePath,
    indexStatus,
    kindFilter,
    namespaceFilter,
    search,
    fuzzySearch,
    viewMode,
    collapsedGroups,
    selectedAssetId,
    setFacets,
    setKindFilter,
    setNamespaceFilter,
    setSearch,
    setFuzzySearch,
    setViewMode,
    toggleGroupCollapsed,
    setSelectedAssetId,
  } = useProjectStore();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (explorerFocusTick > 0) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [explorerFocusTick]);

  useEffect(() => {
    if (!handle) {
      setFacets(null);
      return;
    }
    void ipc
      .getAssetFacets(handle)
      .then(setFacets)
      .catch(() => setFacets(null));
  }, [handle, setFacets]);

  const filtered = useMemo(
    () => applyFilters(assets, kindFilter, namespaceFilter, debouncedSearch, fuzzySearch),
    [assets, kindFilter, namespaceFilter, debouncedSearch, fuzzySearch],
  );

  const collapsedSet = useMemo(
    () => new Set(Object.keys(collapsedGroups).filter((k) => collapsedGroups[k])),
    [collapsedGroups],
  );

  const rows: ExplorerRow[] = useMemo(() => {
    if (viewMode === "grouped") return buildGroupedRows(filtered, collapsedSet);
    if (viewMode === "tree") return buildFilesystemRows(filtered, collapsedSet);
    return buildFlatRows(filtered);
  }, [filtered, viewMode, collapsedSet]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row.type === "group" ? 32 : 40;
    },
    overscan: 16,
  });

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        { id: "select", label: "Open", icon: "↗" },
        { id: "copy-path", label: "Copy path", icon: "⎘", shortcut: "Ctrl+C" },
        { id: "copy-id", label: "Copy ID", icon: "⎘" },
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
      if (!contextMenu) return;
      const { entry } = contextMenu;
      if (id === "select") setSelectedAssetId(entry.id);
      if (id === "copy-path") void navigator.clipboard.writeText(entry.path);
      if (id === "copy-id") void navigator.clipboard.writeText(entry.id);
    },
    [contextMenu, setSelectedAssetId],
  );

  return (
    <div className={styles.panel}>
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems}
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>Assets</h2>
          <div className={styles.viewToggle}>
            <button
              type="button"
              className={viewMode === "grouped" ? styles.toggleActive : styles.toggle}
              onClick={() => setViewMode("grouped")}
              title="Grouped by namespace and kind"
            >
              Kind
            </button>
            <button
              type="button"
              className={viewMode === "tree" ? styles.toggleActive : styles.toggle}
              onClick={() => setViewMode("tree")}
              title="Filesystem-like path tree"
            >
              Tree
            </button>
            <button
              type="button"
              className={viewMode === "flat" ? styles.toggleActive : styles.toggle}
              onClick={() => setViewMode("flat")}
              title="Flat list"
            >
              List
            </button>
          </div>
        </div>
        <p className={styles.subtitle}>
          {indexStatus === "done"
            ? `${filtered.length.toLocaleString()} / ${assetTotal.toLocaleString()} shown`
            : indexStatus === "running"
              ? "Indexing…"
              : "No source open"}
        </p>
        {sourcePath && <p className={styles.sourcePath}>{sourcePath}</p>}
      </div>

      <div className={styles.filters}>
        <input
          ref={searchRef}
          className={styles.search}
          type="search"
          placeholder="Fuzzy search… (Ctrl+F)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!assets.length}
        />
        <label className={styles.fuzzyToggle}>
          <input
            type="checkbox"
            checked={fuzzySearch}
            onChange={(e) => setFuzzySearch(e.target.checked)}
            disabled={!assets.length}
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

      <div ref={parentRef} className={styles.list}>
        {indexStatus === "running" && rows.length === 0 ? (
          <SkeletonBlock rows={8} />
        ) : !rows.length ? (
          <div className={styles.placeholder}>
            <p>
              {indexStatus === "idle"
                ? "Open a JAR mod or resource folder to browse textures, models, and blockstates."
                : "No assets match the current filters."}
            </p>
          </div>
        ) : (
          <div
            className={styles.listInner}
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index];
              if (row.type === "group") {
                const collapsed = collapsedGroups[row.id];
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={styles.groupRow}
                    style={{
                      transform: `translateY(${vRow.start}px)`,
                      paddingLeft: `${12 + row.depth * 14}px`,
                    }}
                    onClick={() => toggleGroupCollapsed(row.id)}
                  >
                    <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
                    <span className={styles.groupLabel}>{row.label}</span>
                    <span className={styles.groupCount}>{row.count}</span>
                  </button>
                );
              }

              const { entry } = row;
              const isTexture = entry.kind === "texture";
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={selectedAssetId === entry.id ? styles.rowActive : styles.row}
                  style={{
                    transform: `translateY(${vRow.start}px)`,
                    paddingLeft: `${12 + row.depth * 14}px`,
                  }}
                  onClick={() => setSelectedAssetId(entry.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                >
                  {isTexture ? (
                    <TextureThumbnail assetPath={entry.path} />
                  ) : (
                    <span className={styles.kindIcon}>
                      {ASSET_KIND_LABELS[entry.kind].charAt(0)}
                    </span>
                  )}
                  <span className={styles.name}>{entry.displayName}</span>
                  {viewMode === "flat" && (
                    <span className={styles.ns}>{entry.namespace}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
