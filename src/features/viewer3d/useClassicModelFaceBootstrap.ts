import { useEffect, useRef } from "react";

import type { RenderableModel } from "../../ipc/types";
import { pickPreferredStudioFace } from "../catalog/modelFaceNav";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";

/** Classic: default to paint + preferred face when a new block model is loaded from the explorer. */
export function useClassicModelFaceBootstrap(
  model: RenderableModel | null,
  assetId: string | undefined,
) {
  const handle = useProjectStore((s) => s.handle);
  const setRightPanelCollapsed = useSettingsStore((s) => s.setRightPanelCollapsed);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const bootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!model || !assetId) return;

    const key = `${assetId}:${model.modelId}`;
    if (bootstrappedRef.current === key) return;
    bootstrappedRef.current = key;

    setRightPanelCollapsed(false);
    setInteractionMode("paint");

    const preferred = pickPreferredStudioFace(model);
    if (preferred) {
      setSelectedFace(preferred);
    }
  }, [
    model,
    assetId,
    setRightPanelCollapsed,
    setInteractionMode,
    setSelectedFace,
  ]);

  useEffect(() => {
    bootstrappedRef.current = null;
  }, [handle?.id]);
}
