import type { ExplorerViewMode, IndexStatus } from "../../state/projectStore";
import { sourcePathBasename } from "./sourcePathLabel";
import styles from "./ExplorerPanel.module.css";

interface ExplorerHeaderProps {
  viewMode: ExplorerViewMode;
  indexStatus: IndexStatus;
  shownCount: number;
  assetTotal: number;
  queryLoading: boolean;
  sourcePath: string | null;
  onViewModeChange: (mode: ExplorerViewMode) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function statusSubtitle(
  indexStatus: IndexStatus,
  shownCount: number,
  assetTotal: number,
): string {
  if (indexStatus === "done") {
    return `${shownCount.toLocaleString()} loaded · ${assetTotal.toLocaleString()} total`;
  }
  if (indexStatus === "running") return "Indexing…";
  if (indexStatus === "error") return "Failed to open source";
  return "No source open";
}

export function ExplorerHeader({
  viewMode,
  indexStatus,
  shownCount,
  assetTotal,
  queryLoading,
  sourcePath,
  onViewModeChange,
  onExpandAll,
  onCollapseAll,
}: ExplorerHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerTop}>
        <h2 className={styles.title}>Assets</h2>
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={viewMode === "grouped" ? styles.toggleActive : styles.toggle}
            onClick={() => onViewModeChange("grouped")}
            title="Grouped by namespace and kind"
          >
            Kind
          </button>
          <button
            type="button"
            className={viewMode === "tree" ? styles.toggleActive : styles.toggle}
            onClick={() => onViewModeChange("tree")}
            title="Filesystem-like path tree"
          >
            Tree
          </button>
          <button
            type="button"
            className={viewMode === "flat" ? styles.toggleActive : styles.toggle}
            onClick={() => onViewModeChange("flat")}
            title="Flat list"
          >
            List
          </button>
        </div>
      </div>
      <div className={styles.headerActions}>
        <button
          type="button"
          className={styles.miniBtn}
          onClick={onExpandAll}
          title="Expand all groups"
        >
          Expand
        </button>
        <button
          type="button"
          className={styles.miniBtn}
          onClick={onCollapseAll}
          title="Collapse all groups"
        >
          Collapse
        </button>
      </div>
      <p className={styles.subtitle}>
        {statusSubtitle(indexStatus, shownCount, assetTotal)}
        {queryLoading ? " · loading…" : ""}
      </p>
      {sourcePath && (
        <p className={styles.sourcePath} title={sourcePath}>
          {sourcePathBasename(sourcePath)}
        </p>
      )}
    </div>
  );
}
