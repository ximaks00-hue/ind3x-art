import { useLayoutEffect, useMemo, useState } from "react";

import { useSettingsStore } from "../../state/settingsStore";
import { useProjectStore } from "../../state/projectStore";
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
    text: "Press / or Ctrl+F to search · arrow keys navigate · right-click to pin.",
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
  originX: number;
  originY: number;
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
      originX: Math.max(12, rect.left) - rect.left + rect.width * 0.25,
      originY: rect.bottom + 8 - rect.top,
    });
  }
  return next;
}

export function TooltipHints() {
  const handle = useProjectStore((s) => s.handle);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const sessionCount = useSettingsStore((s) => s.sessionCount);
  const dismissed = useSettingsStore((s) => s.dismissedHints);
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const [placements, setPlacements] = useState<HintPlacement[]>([]);

  const hintPool = workspaceMode === "studio" ? STUDIO_HINTS : CLASSIC_HINTS;
  const activeHints = useMemo(
    () => hintPool.filter((h) => !dismissed.includes(h.id)),
    [hintPool, dismissed],
  );

  useLayoutEffect(() => {
    let cancelled = false;

    if (handle && workspaceMode !== "studio") {
      setPlacements([]);
      return;
    }

    const refresh = () => {
      if (cancelled) return;
      if (!handle && sessionCount > 3) {
        setPlacements([]);
        return;
      }
      if (handle && workspaceMode === "studio" && sessionCount > 5) {
        setPlacements([]);
        return;
      }
      if (activeHints.length === 0) {
        setPlacements([]);
        return;
      }
      setPlacements(measurePlacements(activeHints));
    };

    const frame = requestAnimationFrame(refresh);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [handle, sessionCount, activeHints, workspaceMode]);

  if (sessionCount > 3 && !handle) return null;
  if (handle && workspaceMode === "studio" && sessionCount > 5) return null;
  if (placements.length === 0) return null;

  return (
    <>
      {placements.map((hint) => (
        <div
          key={hint.id}
          className={styles.hint}
          style={{
            top: hint.top,
            left: hint.left,
            transformOrigin: `${hint.originX}px ${hint.originY}px`,
          }}
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
