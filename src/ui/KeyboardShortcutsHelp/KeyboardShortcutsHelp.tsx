import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./KeyboardShortcutsHelp.module.css";

interface ShortcutRow {
  keys: string;
  description: string;
}

const SHORTCUTS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "General",
    rows: [
      { keys: "Ctrl+K", description: "Command palette" },
      { keys: "Ctrl+S", description: "Save textures" },
      { keys: "Ctrl+Shift+S", description: "Save As…" },
      { keys: "?", description: "Keyboard shortcuts" },
      { keys: "Esc", description: "Close palette / help" },
    ],
  },
  {
    title: "Viewer",
    rows: [
      { keys: "Space", description: "Toggle Orbit / Paint mode" },
      { keys: "1", description: "Iso camera" },
      { keys: "2", description: "Front camera" },
      { keys: "3", description: "Top camera" },
      { keys: "4", description: "GUI / inventory camera" },
      { keys: "5", description: "Free camera" },
      { keys: "C", description: "Toggle before / after comparator" },
    ],
  },
  {
    title: "Editor",
    rows: [
      { keys: "B", description: "Pencil tool" },
      { keys: "E", description: "Eraser" },
      { keys: "G", description: "Fill (flood fill)" },
      { keys: "I / Alt+I", description: "Colour picker" },
      { keys: "L", description: "Line tool" },
      { keys: "U", description: "Rectangle tool" },
      { keys: "Shift+F", description: "Toggle filled rectangle" },
      { keys: "Ctrl+Z", description: "Undo" },
      { keys: "Ctrl+Y / Ctrl+Shift+Z", description: "Redo" },
      { keys: "Ctrl+C", description: "Copy texture region" },
      { keys: "Ctrl+V", description: "Paste region" },
      { keys: "+  /  -", description: "Zoom in / out" },
      { keys: "0", description: "Reset zoom" },
      { keys: ", / .", description: "Prev / Next animation frame" },
    ],
  },
  {
    title: "Navigation",
    rows: [{ keys: "Ctrl+F", description: "Focus explorer search" }],
  },
];

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const trapRef = useFocusTrap(open);
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
          {SHORTCUTS.map((section) => (
            <section key={section.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <dl className={styles.grid}>
                {section.rows.map((row) => (
                  <div key={row.keys} className={styles.row}>
                    <dt>
                      <kbd>{row.keys}</kbd>
                    </dt>
                    <dd>{row.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
