import type { RenderableModel } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { TextureNavigator } from "../catalog/TextureNavigator";
import { UnfoldPanel } from "../catalog/UnfoldPanel";
import { FACE_PICK_CENTER_HINT } from "../catalog/faceEditingGuide";
import { useModelFaceSelection } from "./useModelFaceSelection";
import styles from "./ModelFaceChrome.module.css";
interface ModelFaceChromeProps {
  model: RenderableModel;
}

/** Unfold + texture chips + face hotkeys — shared by Studio and Classic when a block model is loaded. */
export function ModelFaceChrome({ model }: ModelFaceChromeProps) {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const { selectedFace, handleSelectFace, interactionMode } = useModelFaceSelection(model);

  const paintHint =
    workspaceMode === "studio"
      ? FACE_PICK_CENTER_HINT
      : "Click a face to paint · 1–6 jump to faces · chips below";

  return (
    <div className={styles.chrome} data-tour="tour-face-chrome">
      <p className={styles.hint}>
        {interactionMode === "paint"
          ? paintHint
          : "Orbit to inspect · switch to Paint (editor or Space) to edit faces"}
      </p>
      <UnfoldPanel
        model={model}
        selectedFace={selectedFace}
        onSelectFace={handleSelectFace}
        editable={false}
      />
      <TextureNavigator
        model={model}
        selectedFace={selectedFace}
        onSelectFace={handleSelectFace}
      />
    </div>
  );
}
