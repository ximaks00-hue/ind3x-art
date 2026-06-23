import {
  commitChanges,
  copyRegion,
  hasClipboard,
  pasteRegion,
} from "../features/editor/textureDocument";
import { useGlobalHotkeys } from "../hooks/useGlobalHotkeys";
import type { AppCommand } from "../commands/types";
import { useEditorStore } from "../state/editorStore";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useUiStore } from "../state/uiStore";
import { useViewerStore } from "../state/viewerStore";

interface HotkeyWorkflow {
  handleSave: () => Promise<void>;
  setSaveDialogOpen: (open: boolean) => void;
}

export function useAppHotkeyBindings(
  commands: AppCommand[],
  workflow: HotkeyWorkflow,
  enabled: boolean,
) {
  const handle = useProjectStore((s) => s.handle);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const toggleInteractionMode = useSelectionStore((s) => s.toggleInteractionMode);
  const setTool = useEditorStore((s) => s.setTool);
  const toggleComparator = useEditorStore((s) => s.toggleComparator);
  const editorZoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const requestExplorerFocus = useUiStore((s) => s.requestExplorerFocus);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const pushToast = useUiStore((s) => s.pushToast);

  useGlobalHotkeys(
    {
      onSave: () => void workflow.handleSave(),
      onSaveAs: () => workflow.setSaveDialogOpen(true),
      onTogglePaintMode: toggleInteractionMode,
      onSetTool: setTool,
      onFocusExplorer: requestExplorerFocus,
      onToggleComparator: toggleComparator,
      onSetCameraPreset: setCameraPreset,
      onZoomIn: () => setZoom(editorZoom * 2),
      onZoomOut: () => setZoom(Math.round(editorZoom / 2)),
      onZoomReset: () => setZoom(8),
      onNextFrame: () => {
        const meta = useViewerStore.getState().activeTextureMeta;
        const facePath = selectedFace?.texturePath;
        const total = facePath ? (meta[facePath]?.animation?.frames.length ?? 1) : 1;
        stepFrame(1, total);
      },
      onPrevFrame: () => {
        const meta = useViewerStore.getState().activeTextureMeta;
        const facePath = selectedFace?.texturePath;
        const total = facePath ? (meta[facePath]?.animation?.frames.length ?? 1) : 1;
        stepFrame(-1, total);
      },
      onCopy: () => {
        if (!selectedFace) return;
        const path = selectedFace.texturePath;
        const sel = useEditorStore.getState().selection;
        if (sel) {
          const [x0, y0, x1, y1] = [
            Math.min(sel[0], sel[2]),
            Math.min(sel[1], sel[3]),
            Math.max(sel[0], sel[2]),
            Math.max(sel[1], sel[3]),
          ];
          copyRegion(path, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        } else {
          copyRegion(path, 0, 0, 9999, 9999);
        }
        pushToast("Region copied", "info");
      },
      onPaste: () => {
        if (!handle || !selectedFace || !hasClipboard()) return;
        const path = selectedFace.texturePath;
        const sel = useEditorStore.getState().selection;
        const changes = pasteRegion(
          path,
          sel ? Math.min(sel[0], sel[2]) : 0,
          sel ? Math.min(sel[1], sel[3]) : 0,
        );
        if (changes.length > 0) commitChanges(handle, path, changes);
      },
      commands,
    },
    enabled,
  );
}
