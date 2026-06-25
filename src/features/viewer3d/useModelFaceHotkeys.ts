import { useEffect } from "react";

import type { RenderableModel } from "../../ipc/types";
import { buildModelFaceNav, buildSelectedFaceFromModel } from "../catalog/modelFaceNav";

const FACE_DIRECTION_HOTKEYS: Record<string, string> = {
  "1": "north",
  "2": "south",
  "3": "east",
  "4": "west",
  "5": "up",
  "6": "down",
};

/** Jump to model face with number keys 1–6 (north/south/east/west/up/down). */
export function useModelFaceHotkeys(
  model: RenderableModel | null,
  onSelectFace: (cuboidIndex: number, faceIndex: number) => void,
) {
  useEffect(() => {
    if (!model) return;

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
  }, [model, onSelectFace]);
}
