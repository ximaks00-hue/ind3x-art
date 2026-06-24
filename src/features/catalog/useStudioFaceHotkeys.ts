import { useEffect } from "react";

import type { RenderableModel } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { buildModelFaceNav, buildSelectedFaceFromModel } from "./modelFaceNav";

const FACE_DIRECTION_HOTKEYS: Record<string, string> = {
  "1": "north",
  "2": "south",
  "3": "east",
  "4": "west",
  "5": "up",
  "6": "down",
};

/** Studio paint: jump to face with number keys 1–6 (north/south/east/west/up/down). */
export function useStudioFaceHotkeys(
  model: RenderableModel | null,
  onSelectFace: (cuboidIndex: number, faceIndex: number) => void,
) {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  useEffect(() => {
    if (workspaceMode !== "studio" || !model) return;

    const nav = buildModelFaceNav(model);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const direction = FACE_DIRECTION_HOTKEYS[event.key];
      if (!direction) return;

      const item = nav.find((face) => face.direction === direction);
      if (!item) return;

      event.preventDefault();
      const selected = buildSelectedFaceFromModel(model, item.cuboidIndex, item.faceIndex);
      if (selected) {
        onSelectFace(item.cuboidIndex, item.faceIndex);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceMode, model, onSelectFace]);
}
