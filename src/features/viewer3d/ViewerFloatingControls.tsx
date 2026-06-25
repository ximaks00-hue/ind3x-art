import { useMemo, useState } from "react";

import { CAMERA_PRESETS } from "../../lib/cameraPresets";

import { Grid3x3, RotateCcw } from "lucide-react";

import { useRovingTabindex } from "../../hooks/useRovingTabindex";

import { useSelectionStore } from "../../state/selectionStore";

import {

  useViewerStore,

  CAMERA_PRESET_LABELS,

} from "../../state/viewerStore";

import {

  toggleViewerShowGrid,

  useViewerShowGrid,

} from "../../state/viewerPreferencesSync";

import { IconButton } from "../../ui/primitives/IconButton";

import { Icon } from "../../ui/icons/Icon";

import styles from "./ViewerFloatingControls.module.css";



interface ViewerFloatingControlsProps {

  visible?: boolean;

}



export function ViewerFloatingControls({ visible = true }: ViewerFloatingControlsProps) {

  const interactionMode = useSelectionStore((s) => s.interactionMode);

  const cameraPreset = useViewerStore((s) => s.cameraPreset);

  const uvDebugMode = useViewerStore((s) => s.uvDebugMode);

  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);

  const resetCamera = useViewerStore((s) => s.resetCamera);

  const setUvDebugMode = useViewerStore((s) => s.setUvDebugMode);

  const showGrid = useViewerShowGrid();

  const showUvDebug = import.meta.env.DEV;



  const freeIndex = CAMERA_PRESETS.length;

  const resetIndex = freeIndex + 1;

  const gridIndex = resetIndex + 1;

  const uvIndex = gridIndex + 1;

  const buttonCount = gridIndex + 1 + (showUvDebug ? 1 : 0);



  const [focusIndex, setFocusIndex] = useState(0);
  const { setItemRef, onKeyDown, getTabIndex } = useRovingTabindex(buttonCount, focusIndex, {
    onIndexChange: setFocusIndex,
  });



  const focusProps = useMemo(

    () => (index: number) => ({

      ref: setItemRef(index),

      tabIndex: getTabIndex(index),

      onFocus: () => setFocusIndex(index),

    }),

    [setItemRef, getTabIndex],

  );



  if (!visible) return null;



  return (

    <div

      className={styles.host}

      data-canvas-hud=""

      role="toolbar"

      aria-label="Viewport camera and display"

      onKeyDown={onKeyDown}

    >

      <div className={styles.cluster} aria-label="Camera presets">

        {CAMERA_PRESETS.map((preset, index) => (

          <IconButton

            key={preset.id}

            {...focusProps(index)}

            label={`${CAMERA_PRESET_LABELS[preset.id]} (${preset.hotkey})`}

            className={cameraPreset === preset.id ? styles.btnActive : styles.btn}

            onClick={() => setCameraPreset(preset.id)}

          >

            {preset.label}

          </IconButton>

        ))}

        <IconButton

          {...focusProps(freeIndex)}

          label="Free camera (5)"

          className={cameraPreset === "free" ? styles.btnActive : styles.btn}

          onClick={() => setCameraPreset("free")}

        >

          Free

        </IconButton>

        <IconButton

          {...focusProps(resetIndex)}

          label="Reset view"

          className={styles.btn}

          onClick={resetCamera}

        >

          <Icon icon={RotateCcw} size={16} />

        </IconButton>

      </div>



      <div className={styles.cluster} aria-label="Viewport display options">

        <IconButton

          {...focusProps(gridIndex)}

          label="Toggle floor grid"

          className={showGrid ? styles.btnActive : styles.btn}

          onClick={() => toggleViewerShowGrid()}

        >

          <Icon icon={Grid3x3} size={16} />

        </IconButton>

        {showUvDebug ? (

          <IconButton

            {...focusProps(uvIndex)}

            label="UV lock debug"

            className={uvDebugMode ? styles.btnActive : styles.btn}

            onClick={() => setUvDebugMode(!uvDebugMode)}

          >

            UV

          </IconButton>

        ) : null}

        <span className={styles.modeBadge} data-mode={interactionMode}>

          {interactionMode === "orbit" ? "Orbit" : "Paint"}

        </span>

      </div>

    </div>

  );

}

