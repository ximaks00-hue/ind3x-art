import { useEffect, useRef } from "react";

import type { RenderableModel } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useViewerStore } from "../../state/viewerStore";
import { pickPreferredStudioFace } from "./modelFaceNav";

/** Studio mode: paint interaction + default face when a catalog model loads (first select only). */
export function useStudioFaceBootstrap(model: RenderableModel | null) {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const selectedAssetId = useProjectStore((s) => s.selectedAssetId);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const bootstrappedAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceMode !== "studio" || !model || !selectedAssetId) return;

    if (bootstrappedAssetIdRef.current === selectedAssetId) return;
    bootstrappedAssetIdRef.current = selectedAssetId;

    setInteractionMode("paint");
    setCameraPreset(
      model.kind === "itemGenerated" || model.kind === "itemModel" ? "inventory" : "iso",
    );

    const preferred = pickPreferredStudioFace(model);
    if (preferred) {
      setSelectedFace(preferred);
    }
  }, [
    workspaceMode,
    model,
    selectedAssetId,
    setInteractionMode,
    setSelectedFace,
    setCameraPreset,
  ]);

  useEffect(() => {
    if (workspaceMode !== "studio") {
      bootstrappedAssetIdRef.current = null;
    }
  }, [workspaceMode]);
}
