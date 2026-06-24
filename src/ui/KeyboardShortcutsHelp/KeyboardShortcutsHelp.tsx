import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  formatShortcutDisplay,
  shortcutsByCategory,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutCategory,
} from "../../lib/shortcuts";
import styles from "./KeyboardShortcutsHelp.module.css";

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: ShortcutCategory[] = [
  "general",
  "layout",
  "navigation",
  "viewer",
  "editor",
];

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const trapRef = useFocusTrap(open);
  const grouped = shortcutsByCategory();

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose} role="presentation">
      <div
        className={styles.dialog}
        ref={trapRef}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard shortcuts</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Esc
          </button>
        </div>
        <div className={styles.body}>
          {CATEGORY_ORDER.map((category) => {
            const rows = grouped[category].filter((s) => s.binding);
            if (rows.length === 0) return null;
            return (
              <section key={category} className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  {SHORTCUT_CATEGORY_LABELS[category]}
                </h3>
                <dl className={styles.grid}>
                  {rows.map((row) => (
                    <div key={row.id} className={styles.row}>
                      <dt>
                        <kbd>{formatShortcutDisplay(row.binding)}</kbd>
                      </dt>
                      <dd>{row.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
