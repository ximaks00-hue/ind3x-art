import type { CatalogEntry } from "../../ipc/types";
import { useDocumentRevision } from "../editor/documentStore";
import { catalogEntryIsDirty } from "./catalogUtils";
import { CatalogIcon } from "./CatalogIcon";
import styles from "./CatalogQuickRow.module.css";

interface CatalogQuickRowProps {
  label: string;
  entries: CatalogEntry[];
  pinnedIds: Set<string>;
  selectedId: string | null;
  onSelect: (entry: CatalogEntry) => void;
  onTogglePin: (entry: CatalogEntry) => void;
}

export function CatalogQuickRow({
  label,
  entries,
  pinnedIds,
  selectedId,
  onSelect,
  onTogglePin,
}: CatalogQuickRowProps) {
  useDocumentRevision();
  if (entries.length === 0) return null;

  return (
    <div className={styles.row} aria-label={label}>
      <span className={styles.label}>{label}</span>
      <div className={styles.chips}>
        {entries.map((entry) => {
          const pinned = pinnedIds.has(entry.id);
          const isDirty = catalogEntryIsDirty(entry);
          const initial = entry.displayName.trim().charAt(0).toUpperCase() || "?";
          return (
            <button
              key={entry.id}
              type="button"
              className={[
                styles.chip,
                selectedId === entry.id ? styles.chipActive : "",
                pinned ? styles.chipPinned : "",
                isDirty ? styles.chipDirty : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={`${entry.displayName}${pinned ? " (pinned)" : ""}${isDirty ? " (unsaved)" : ""} — right-click to pin`}
              onClick={() => onSelect(entry)}
              onContextMenu={(event) => {
                event.preventDefault();
                onTogglePin(entry);
              }}
            >
              <span className={styles.thumb}>
                <CatalogIcon entry={entry} size={28} fallbackInitial={initial} />
              </span>
              <span className={styles.name}>{entry.displayName}</span>
              {pinned ? <span className={styles.pinMark}>★</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
