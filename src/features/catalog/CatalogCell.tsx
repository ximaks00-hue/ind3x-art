import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { catalogEntryHasWarnings, catalogEntryIsDirty, getCatalogEntryWarnings } from "./catalogUtils";
import { useEditorStore } from "../../state/editorStore";
import { CatalogIcon } from "./CatalogIcon";
import { useCatalogIconStatus } from "./useCatalogIconPipeline";
import styles from "./CatalogCell.module.css";

interface CatalogCellProps {
  entry: CatalogEntry;
  selected: boolean;
  focused: boolean;
  onClick: () => void;
}

export function CatalogCell({ entry, selected, focused, onClick }: CatalogCellProps) {
  const handle = useProjectStore((s) => s.handle);
  const { error: iconBakeError } = useCatalogIconStatus(handle?.id, entry.iconKey);
  void useEditorStore((s) => s.revision);
  const isDirty = catalogEntryIsDirty(entry);
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || "?";
  const warnings = getCatalogEntryWarnings(entry, iconBakeError);
  const title =
    warnings.length > 0 ? `${entry.displayName}\n${warnings.join("\n")}` : entry.displayName;

  return (
    <button
      type="button"
      className={[
        styles.cell,
        selected ? styles.selected : "",
        focused ? styles.focused : "",
        catalogEntryHasWarnings(entry, iconBakeError) ? styles.warned : "",
        isDirty ? styles.dirty : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      title={title}
      aria-label={entry.displayName}
      aria-pressed={selected}
    >
      {isDirty ? (
        <span className={styles.dirtyBadge} title="Unsaved texture changes" aria-label="Dirty">
          ●
        </span>
      ) : null}
      {warnings.length > 0 ? (
        <span className={styles.warnBadge} title={warnings[0]} aria-label={warnings[0]}>
          !
        </span>
      ) : null}
      <CatalogIcon entry={entry} fallbackInitial={initial} />
      <span className={styles.label}>{entry.displayName}</span>
    </button>
  );
}
