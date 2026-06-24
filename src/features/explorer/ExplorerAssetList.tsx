import type { RefObject } from "react";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";

import type { AssetEntry } from "../../ipc/types";
import { ASSET_KIND_LABELS } from "../../ipc/types";
import type { ExplorerViewMode } from "../../state/projectStore";
import type { RecentProject } from "../../state/settingsStore";
import { WelcomeScreen } from "../../ui/WelcomeScreen/WelcomeScreen";
import { SkeletonBlock } from "../../ui/Skeleton/Skeleton";
import type { ExplorerRow } from "./buildTree";
import styles from "./ExplorerPanel.module.css";
import { TextureThumbnail } from "./TextureThumbnail";

interface ExplorerAssetListProps {
  parentRef: RefObject<HTMLDivElement | null>;
  handle: { id: number } | null;
  indexStatus: string;
  rows: ExplorerRow[];
  navigableRows: (ExplorerRow & { type: "asset" })[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualItems: VirtualItem[];
  queryLoading: boolean;
  viewMode: ExplorerViewMode;
  collapsedGroups: Record<string, boolean>;
  selectedAssetId: string | null;
  focusRowIndex: number;
  validationById: Record<string, number>;
  pinnedAssetIds: string[];
  recentProjects: RecentProject[];
  onToggleGroup: (groupId: string) => void;
  onPickAsset: (entry: AssetEntry) => void;
  onContextMenu: (x: number, y: number, entry: AssetEntry) => void;
  onOpenJar?: () => void;
  onOpenFolder?: () => void;
  onOpenRecent?: (path: string, kind: "jar" | "folder") => void;
  onTryDemo?: () => void;
}

export function ExplorerAssetList({
  parentRef,
  handle,
  indexStatus,
  rows,
  navigableRows,
  virtualizer,
  virtualItems,
  queryLoading,
  viewMode,
  collapsedGroups,
  selectedAssetId,
  focusRowIndex,
  validationById,
  pinnedAssetIds,
  recentProjects,
  onToggleGroup,
  onPickAsset,
  onContextMenu,
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: ExplorerAssetListProps) {
  return (
    <div
      ref={parentRef}
      className={styles.list}
      role="listbox"
      aria-label="Project assets"
      aria-activedescendant={
        navigableRows[focusRowIndex]?.type === "asset"
          ? `explorer-asset-${navigableRows[focusRowIndex].entry.id}`
          : undefined
      }
    >
      {!handle ? (
        <WelcomeScreen
          variant="panel"
          recentProjects={recentProjects}
          onOpenJar={() => onOpenJar?.()}
          onOpenFolder={() => onOpenFolder?.()}
          onOpenRecent={onOpenRecent}
          onTryDemo={onTryDemo}
        />
      ) : indexStatus === "running" && rows.length === 0 ? (
        <SkeletonBlock rows={8} />
      ) : !rows.length && !queryLoading ? (
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
          {virtualItems.map((vRow) => {
            const row = rows[vRow.index];
            if (!row) return null;
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
                  onClick={() => onToggleGroup(row.id)}
                >
                  <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>
                  <span className={styles.groupLabel}>{row.label}</span>
                  <span className={styles.groupCount}>{row.count}</span>
                </button>
              );
            }

            const { entry } = row;
            const isTexture = entry.kind === "texture";
            const navIndex = navigableRows.findIndex(
              (r) => r.type === "asset" && r.entry.id === entry.id,
            );
            const isFocused = navIndex === focusRowIndex;
            const warnCount = validationById[entry.id];

            return (
              <button
                key={entry.id}
                id={`explorer-asset-${entry.id}`}
                type="button"
                role="option"
                aria-selected={selectedAssetId === entry.id}
                aria-label={`${entry.displayName}, ${ASSET_KIND_LABELS[entry.kind]}${
                  warnCount ? `, ${warnCount} validation issues` : ""
                }${pinnedAssetIds.includes(entry.id) ? ", pinned" : ""}`}
                className={[
                  selectedAssetId === entry.id ? styles.rowActive : styles.row,
                  isFocused ? styles.rowFocused : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  transform: `translateY(${vRow.start}px)`,
                  paddingLeft: `${12 + row.depth * 14}px`,
                }}
                onClick={() => onPickAsset(entry)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(e.clientX, e.clientY, entry);
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
                {entry.linkedModelCount != null && entry.linkedModelCount > 0 && (
                  <span className={styles.linkBadge} title="Linked models">
                    {entry.linkedModelCount}
                  </span>
                )}
                {warnCount != null && warnCount > 0 && (
                  <span className={styles.warnBadge} title="Validation issues">
                    ⚠
                  </span>
                )}
                {pinnedAssetIds.includes(entry.id) && (
                  <span className={styles.pinMark}>★</span>
                )}
                {viewMode === "flat" && (
                  <span className={styles.ns}>{entry.namespace}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
