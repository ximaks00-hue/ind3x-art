import { useCallback } from "react";

import type { RenderableModel } from "../../ipc/types";
import { buildSelectedFaceFromModel } from "../catalog/modelFaceNav";
import { useSelectionStore } from "../../state/selectionStore";
import { useModelFaceHotkeys } from "./useModelFaceHotkeys";

/** Shared face pick handler + 1–6 hotkeys for any workspace mode with a 3D model. */
export function useModelFaceSelection(model: RenderableModel | null) {
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);

  const handleSelectFace = useCallback(
    (cuboidIndex: number, faceIndex: number) => {
      if (!model) return;
      const face = buildSelectedFaceFromModel(model, cuboidIndex, faceIndex);
      if (!face) return;
      setSelectedFace(face);
      if (interactionMode !== "paint") {
        setInteractionMode("paint");
      }
    },
    [model, setSelectedFace, setInteractionMode, interactionMode],
  );

  useModelFaceHotkeys(model, handleSelectFace);

  return { selectedFace, handleSelectFace, interactionMode };
}
