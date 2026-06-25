import { shortcutForTool } from "../../lib/shortcuts";
import { useRovingTabindex } from "../../hooks/useRovingTabindex";
import { TOOL_LABELS, useEditorStore, type EditorTool } from "../../state/editorStore";
import { Icon } from "../../ui/icons/Icon";
import { TOOL_LUCIDE_ICONS } from "./toolLucideIcons";
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
  const activeIndex = Math.max(0, TOOLS.indexOf(tool));

  const { setItemRef, onKeyDown, getTabIndex } = useRovingTabindex(TOOLS.length, activeIndex, {
    activateOnFocus: true,
    onActivate: (index) => {
      const next = TOOLS[index];
      if (next) setTool(next);
    },
  });

  return (
    <div className={styles.bar} role="toolbar" aria-label="Drawing tools" onKeyDown={onKeyDown}>
      {TOOLS.map((t, index) => (
        <button
          key={t}
          ref={setItemRef(index)}
          type="button"
          className={tool === t ? styles.active : styles.btn}
          onClick={() => setTool(t)}
          tabIndex={getTabIndex(index)}
          title={(() => {
            const key = shortcutForTool(t);
            return key ? `${TOOL_LABELS[t]} (${key})` : TOOL_LABELS[t];
          })()}
          aria-pressed={tool === t}
          aria-label={TOOL_LABELS[t]}
        >
          <Icon icon={TOOL_LUCIDE_ICONS[t]} size={16} className={styles.icon} />
        </button>
      ))}
    </div>
  );
}
