import { useMemo } from "react";

import { formatFaceDirection, textureBasename } from "./studioStatusLabels";
import { getActiveLayerIndex, isTextureDirty, useDocumentRevision } from "../features/editor/documentStore";
import { useDirtyTextureCount } from "../features/save/useDirtyTextures";
import { useCatalogStore } from "../features/catalog/catalogStore";
import { TOOL_LABELS, useEditorStore } from "../state/editorStore";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { CAMERA_PRESET_LABELS, useViewerStore } from "../state/viewerStore";

export function useAppStatusBar() {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const queryTotal = useProjectStore((s) => s.queryTotal);
  const ipcHealthy = useProjectStore((s) => s.ipcHealthy);

  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  const catalogSelectedEntry = useCatalogStore((s) => s.selectedEntry);
  const catalogTotal = useCatalogStore((s) => s.total);
  const catalogLoading = useCatalogStore((s) => s.loading);
  const catalogQueryError = useCatalogStore((s) => s.queryError);

  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const selectedFace = useSelectionStore((s) => s.selectedFace);

  const editorTool = useEditorStore((s) => s.tool);
  const editorZoom = useEditorStore((s) => s.zoom);
  const editorCursorX = useEditorStore((s) => s.cursorX);
  const editorCursorY = useEditorStore((s) => s.cursorY);
  const editorRevision = useEditorStore((s) => s.revision);
  const documentRevision = useDocumentRevision();

  const cameraPreset = useViewerStore((s) => s.cameraPreset);

  const dirtyCount = useDirtyTextureCount();

  const layerInfo = useMemo(() => {
    if (!selectedFace) return null;
    void editorRevision;
    return getActiveLayerIndex(selectedFace.texturePath);
  }, [selectedFace, editorRevision]);

  const studioStatus = useMemo(() => {
    if (workspaceMode !== "studio") return null;
    return {
      workspaceLabel: "Studio",
      catalogTotal: indexStatus === "done" ? catalogTotal : undefined,
      catalogLoading,
      catalogQueryError,
      catalogEntryLabel: catalogSelectedEntry?.displayName ?? catalogSelectedEntry?.id,
      faceDirection: selectedFace
        ? formatFaceDirection(selectedFace.direction)
        : undefined,
      textureLabel: selectedFace ? textureBasename(selectedFace.texturePath) : undefined,
      textureDirty: selectedFace ? isTextureDirty(selectedFace.texturePath) : false,
    };
  }, [
    workspaceMode,
    catalogSelectedEntry,
    selectedFace,
    catalogTotal,
    catalogLoading,
    catalogQueryError,
    indexStatus,
    editorRevision,
    documentRevision,
  ]);

  return {
    ipcHealthy,
    assetCount: indexStatus === "done" ? queryTotal : undefined,
    indexStatus,
    studioStatus,
    studioCompact: workspaceMode === "studio",
    toolLabel: selectedFace ? TOOL_LABELS[editorTool] : undefined,
    layerIndex: layerInfo?.index,
    layerTotal: layerInfo?.total,
    dirtyCount,
    zoom: selectedFace ? editorZoom : undefined,
    cursorX: selectedFace ? editorCursorX : undefined,
    cursorY: selectedFace ? editorCursorY : undefined,
    interactionMode: handle ? interactionMode : undefined,
    cameraPreset: handle ? CAMERA_PRESET_LABELS[cameraPreset] : undefined,
  };
}
