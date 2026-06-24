import { useLayoutEffect, useState } from "react";

import { useSettingsStore } from "../../state/settingsStore";
import styles from "./TooltipHints.module.css";

const CLASSIC_HINTS = [
  {
    id: "explorer-search",
    target: "hint-explorer",
    text: "Press / or Ctrl+F to search assets instantly.",
  },
  {
    id: "command-palette",
    target: "hint-commands",
    text: "Ctrl+K opens every tool, filter, and setting.",
  },
  {
    id: "paint-mode",
    target: "hint-viewer",
    text: "Space toggles Orbit and Paint — click a face to edit.",
  },
  {
    id: "save",
    target: "hint-save",
    text: "Ctrl+S saves all dirty textures with automatic backup.",
  },
] as const;

const STUDIO_HINTS = [
  {
    id: "studio-workspace",
    target: "tour-workspace-mode",
    text: "Switch between Classic explorer and Block Studio anytime.",
  },
  {
    id: "studio-catalog",
    target: "hint-catalog",
    text: "Arrow keys navigate the grid · Enter selects a block.",
  },
  {
    id: "studio-paint",
    target: "tour-studio-viewport",
    text: "Click faces in the viewport or use texture chips below to switch.",
  },
  {
    id: "command-palette",
    target: "hint-commands",
    text: "Ctrl+K — switch workspace, tools, and restart the Studio tour.",
  },
  {
    id: "save",
    target: "hint-save",
    text: "Ctrl+S saves all dirty textures with automatic backup.",
  },
] as const;

type HintDef = (typeof CLASSIC_HINTS)[number] | (typeof STUDIO_HINTS)[number];

interface HintPlacement {
  id: string;
  text: string;
  top: number;
  left: number;
}

function measurePlacements(activeHints: ReadonlyArray<HintDef>): HintPlacement[] {
  const next: HintPlacement[] = [];
  for (const hint of activeHints) {
    const el = document.querySelector(`[data-tour~="${hint.target}"]`);
    const rect = el?.getBoundingClientRect();
    if (!rect) continue;
    next.push({
      id: hint.id,
      text: hint.text,
      top: rect.bottom + 8,
      left: Math.max(12, rect.left),
    });
  }
  return next;
}

export function TooltipHints() {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const sessionCount = useSettingsStore((s) => s.sessionCount);
  const dismissed = useSettingsStore((s) => s.dismissedHints);
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const [placements, setPlacements] = useState<HintPlacement[]>([]);

  const hintPool = workspaceMode === "studio" ? STUDIO_HINTS : CLASSIC_HINTS;
  const activeHints = hintPool.filter((h) => !dismissed.includes(h.id));

  useLayoutEffect(() => {
    let cancelled = false;

    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      if (sessionCount > 3 || activeHints.length === 0) {
        setPlacements([]);
        return;
      }
      setPlacements(measurePlacements(activeHints));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [sessionCount, activeHints, dismissed, workspaceMode]);

  if (sessionCount > 3 || placements.length === 0) return null;

  return (
    <>
      {placements.map((hint) => (
        <div
          key={hint.id}
          className={styles.hint}
          style={{ top: hint.top, left: hint.left }}
          role="status"
        >
          <p>{hint.text}</p>
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => dismissHint(hint.id)}
            aria-label="Dismiss hint"
          >
            Got it
          </button>
        </div>
      ))}
    </>
  );
}
