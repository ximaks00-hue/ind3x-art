import { shortcutForTool } from "../../lib/shortcuts";
import {
  TOOL_ICONS,
  TOOL_LABELS,
  useEditorStore,
  type EditorTool,
} from "../../state/editorStore";
import styles from "./ToolIconBar.module.css";

const TOOLS: EditorTool[] = [
  "pencil",
  "eraser",
  "fill",
  "picker",
  "wand",
  "line",
  "rect",
  "ellipse",
  "select",
  "move",
  "lighten",
  "darken",
  "dither",
];

export function ToolIconBar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);

  return (
    <div className={styles.bar} role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t}
          type="button"
          className={tool === t ? styles.active : styles.btn}
          onClick={() => setTool(t)}
          title={(() => {
            const key = shortcutForTool(t);
            return key ? `${TOOL_LABELS[t]} (${key})` : TOOL_LABELS[t];
          })()}
          aria-pressed={tool === t}
          aria-label={TOOL_LABELS[t]}
        >
          <span className={styles.icon}>{TOOL_ICONS[t]}</span>
        </button>
      ))}
    </div>
  );
}
