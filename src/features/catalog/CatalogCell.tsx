import { useState } from "react";
import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import {
  catalogEntryHasWarnings,
  catalogEntryIsDirty,
  getCatalogEntryWarnings,
} from "./catalogUtils";
import { useDocumentRevision } from "../editor/documentStore";
import { useSettingsStore } from "../../state/settingsStore";
import { CatalogIcon } from "./CatalogIcon";
import { CatalogCellCompare } from "./CatalogCellCompare";
import { catalogIconCacheKey, clearCatalogIconFailure } from "./catalogIconCache";
import { scheduleCatalogIconBakes } from "./catalogIconPipeline";
import { useCatalogIconStatus } from "./useCatalogIconPipeline";
import styles from "./CatalogCell.module.css";

interface CatalogCellProps {
  entry: CatalogEntry;
  selected: boolean;
  focused: boolean;
  pinned?: boolean;
  onClick: () => void;
  onTogglePin?: () => void;
}

export function CatalogCell({
  entry,
  selected,
  focused,
  pinned = false,
  onClick,
  onTogglePin,
}: CatalogCellProps) {
  const handle = useProjectStore((s) => s.handle);
  const showLabels = useSettingsStore((s) => s.catalogShowCellLabels);
  const iconMode = useSettingsStore((s) => s.catalogIconMode);
  const iconCacheLimit = useSettingsStore((s) => s.catalogIconCacheLimit);
  const textureCacheLimit = useSettingsStore((s) => s.textureCacheLimit);
  const { error: iconBakeError } = useCatalogIconStatus(handle?.id, entry.iconKey);
  useDocumentRevision();
  const [compareHover, setCompareHover] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const isDirty = catalogEntryIsDirty(entry);
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || "?";
  const warnings = getCatalogEntryWarnings(entry, iconBakeError);
  const tooltipLines = [
    entry.displayName,
    entry.id,
    entry.namespace,
    ...warnings,
  ];
  const title = tooltipLines.join("\n");

  const retryIconBake = (event: React.MouseEvent) => {
    if (!iconBakeError || !handle) return;
    event.stopPropagation();
    const key = catalogIconCacheKey(handle.id, entry.iconKey);
    clearCatalogIconFailure(key);
    scheduleCatalogIconBakes(
      [{ entries: [entry], priority: "selected" }],
      handle,
      iconMode,
      iconCacheLimit,
      textureCacheLimit,
    );
  };

  const onCellKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div className={styles.cellHost}>
      <div
        role="gridcell"
        tabIndex={focused ? 0 : -1}
        className={[
          styles.cell,
          selected ? styles.selected : "",
          focused ? styles.focused : "",
          catalogEntryHasWarnings(entry, iconBakeError) ? styles.warned : "",
          isDirty ? styles.dirty : "",
          pinned ? styles.pinned : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
        onKeyDown={onCellKeyDown}
        onMouseEnter={() => setCompareHover(true)}
        onMouseLeave={() => {
          setCompareHover(false);
          setTooltipOpen(false);
        }}
        onFocus={() => {
          setCompareHover(true);
          setTooltipOpen(true);
        }}
        onBlur={() => {
          setCompareHover(false);
          setTooltipOpen(false);
        }}
        onPointerEnter={() => setTooltipOpen(true)}
        onContextMenu={
          onTogglePin
            ? (event) => {
                event.preventDefault();
                onTogglePin();
              }
            : undefined
        }
        title={title}
        aria-label={entry.displayName}
        aria-selected={selected}
      >
        {pinned ? (
          <span className={styles.pinBadge} aria-label="Pinned">
            ★
          </span>
        ) : null}
        {isDirty ? (
          <span
            className={styles.dirtyBadge}
            title="Unsaved texture changes"
            aria-label="Dirty"
          >
            ●
          </span>
        ) : null}
        {warnings.length > 0 && !iconBakeError ? (
          <span className={styles.warnBadge} title={warnings[0]} aria-label={warnings[0]}>
            !
          </span>
        ) : null}
        <CatalogCellCompare entry={entry} active={compareHover && isDirty} />
        <CatalogIcon entry={entry} fallbackInitial={initial} />
        {showLabels ? <span className={styles.label}>{entry.displayName}</span> : null}
      </div>
      {tooltipOpen ? (
        <div className={styles.tooltip} role="tooltip">
          <div className={styles.tooltipTitle}>{entry.displayName}</div>
          <div className={styles.tooltipMeta}>{entry.id}</div>
          <div className={styles.tooltipMeta}>{entry.namespace}</div>
          {warnings.map((warning) => (
            <div key={warning} className={styles.tooltipWarn}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}
      {iconBakeError ? (
        <button
          type="button"
          className={`${styles.warnBadge} ${styles.warnRetry}`}
          title={`${warnings[0]} — click to retry`}
          aria-label={warnings[0]}
          onClick={retryIconBake}
        >
          !
        </button>
      ) : null}
    </div>
  );
}
