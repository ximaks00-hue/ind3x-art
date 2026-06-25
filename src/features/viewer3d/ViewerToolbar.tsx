import { CAMERA_PRESETS, DISPLAY_SLOTS } from "../../lib/cameraPresets";
import { LIGHTING_PRESETS } from "../../lib/lightingPresets";
import { exportViewerScreenshot } from "../../lib/exportScreenshot";
import type {
  AssetEntry,
  ModelRefInfo,
  ProjectHandle,
  RenderableModel,
  VariantKey,
} from "../../ipc/types";
import { useInteractionStore } from "../../state/interactionStore";
import { useSelectionStore } from "../../state/selectionStore";
import {
  useViewerStore,
  CAMERA_PRESET_LABELS,
  type LightingPreset,
} from "../../state/viewerStore";
import {
  setViewerLightingPreset,
  toggleViewerShowGrid,
  useViewerLightingPreset,
  useViewerShowGrid,
} from "../../state/viewerPreferencesSync";
import { IconButton } from "../../ui/primitives/IconButton";
import { Select } from "../../ui/primitives/Select";
import { BIOME_TINT_PALETTES } from "./textureLoader";
import { applyBiomeChange } from "./viewerTextureSync";
import { MiniSceneControl } from "./MiniSceneControl";
import styles from "./ViewerToolbar.module.css";

const BIOME_NAMES = Object.keys(BIOME_TINT_PALETTES);

interface ViewerToolbarProps {
  handle: ProjectHandle | null;
  selected: AssetEntry | null;
  renderable: RenderableModel | null;
  variants: VariantKey[];
  variantKey: string | undefined;
  linkedModels: ModelRefInfo[];
  linkedModelPath: string;
  biome: string;
  onVariantChange: (key: string) => void;
  onLinkedModelChange: (path: string) => void;
  onBiomeChange: (biome: string) => void;
  canCubeWrap?: boolean;
  cubeWrap?: boolean;
  onCubeWrapChange?: (enabled: boolean) => void;
  hidden?: boolean;
}

export function ViewerToolbar({
  handle,
  selected,
  renderable,
  variants,
  variantKey,
  linkedModels,
  linkedModelPath,
  biome,
  onVariantChange,
  onLinkedModelChange,
  onBiomeChange,
  canCubeWrap = false,
  cubeWrap = false,
  onCubeWrapChange,
  hidden = false,
}: ViewerToolbarProps) {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);
  const storeDisplaySlot = useViewerStore((s) => s.displaySlot);
  const lightingPreset = useViewerLightingPreset();
  const showGrid = useViewerShowGrid();
  const uvDebugMode = useViewerStore((s) => s.uvDebugMode);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const resetCamera = useViewerStore((s) => s.resetCamera);
  const setStoreDisplaySlot = useViewerStore((s) => s.setDisplaySlot);
  const setUvDebugMode = useViewerStore((s) => s.setUvDebugMode);

  const comparatorMode = useInteractionStore((s) => s.comparatorMode);
  const cycleComparator = useInteractionStore((s) => s.cycleComparator);
  const captureCompareBefore = useInteractionStore((s) => s.captureCompareBefore);

  const compareLabel =
    comparatorMode === "2d" ? "2D" : comparatorMode === "3d" ? "3D" : "Off";

  return (
    <div className={styles.toolbar} hidden={hidden} aria-hidden={hidden}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>Variant</span>
        {variants.length > 1 && selected ? (
          <Select
            className={styles.select}
            value={variantKey ?? ""}
            aria-label="Block variant"
            onChange={(e) => onVariantChange(e.target.value)}
          >
            {variants.map((variant) => (
              <option key={variant.key} value={variant.key}>
                {variant.key}
                {variant.weight ? ` (w${variant.weight})` : ""}
              </option>
            ))}
          </Select>
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Biome</span>
        <Select
          className={styles.select}
          value={biome}
          aria-label="Biome tint"
          onChange={(e) => {
            const next = e.target.value;
            onBiomeChange(next);
            if (handle) applyBiomeChange(handle, next);
          }}
        >
          {BIOME_NAMES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Display</span>
        {renderable && Object.keys(renderable.display).length > 0 ? (
          <Select
            className={styles.select}
            value={storeDisplaySlot}
            aria-label="Display slot"
            onChange={(e) =>
              setStoreDisplaySlot(e.target.value as typeof storeDisplaySlot)
            }
          >
            {DISPLAY_SLOTS.filter((s) => renderable.display[s]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </div>

      {selected?.kind === "texture" && linkedModels.length >= 3 && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Model</span>
          <Select
            className={styles.select}
            value={linkedModelPath}
            aria-label="Linked model"
            onChange={(e) => onLinkedModelChange(e.target.value)}
          >
            {linkedModels.map((model) => (
              <option key={model.modelId} value={model.path}>
                {model.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {canCubeWrap && onCubeWrapChange ? (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Preview</span>
          <IconButton
            label="Wrap texture in a cube for face painting"
            className={cubeWrap ? styles.btnActive : styles.btn}
            onClick={() => onCubeWrapChange(!cubeWrap)}
          >
            Cube
          </IconButton>
        </div>
      ) : null}

      <div className={styles.group}>
        <span className={styles.groupLabel}>Scene</span>
        <MiniSceneControl />
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Camera</span>
        <div className={styles.btnRow}>
          {CAMERA_PRESETS.map((preset) => (
            <IconButton
              key={preset.id}
              label={`${CAMERA_PRESET_LABELS[preset.id]} (${preset.hotkey})`}
              className={cameraPreset === preset.id ? styles.btnActive : styles.btn}
              onClick={() => setCameraPreset(preset.id)}
            >
              {preset.label}
            </IconButton>
          ))}
          <IconButton
            label="Free camera (5)"
            className={cameraPreset === "free" ? styles.btnActive : styles.btn}
            onClick={() => setCameraPreset("free")}
          >
            Free
          </IconButton>
          <IconButton label="Reset view" className={styles.btn} onClick={resetCamera}>
            ↺
          </IconButton>
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Light</span>
        <Select
          className={styles.select}
          value={lightingPreset}
          aria-label="Lighting preset"
          onChange={(e) => setViewerLightingPreset(e.target.value as LightingPreset)}
        >
          {LIGHTING_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Compare</span>
        <div className={styles.btnRow}>
          <IconButton
            label="Cycle comparator: off → 2D → 3D (C)"
            className={comparatorMode != null ? styles.btnActive : styles.btn}
            onClick={() => cycleComparator(renderable)}
          >
            {compareLabel}
          </IconButton>
          <IconButton
            label="Capture before snapshot"
            className={styles.btn}
            disabled={!renderable}
            onClick={() => renderable && captureCompareBefore(renderable)}
          >
            📷
          </IconButton>
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Export</span>
        <IconButton
          label="Export screenshot"
          className={styles.btn}
          onClick={() => void exportViewerScreenshot()}
        >
          ⤓
        </IconButton>
      </div>

      <div className={styles.groupEnd}>
        <IconButton
          label="Toggle floor grid"
          className={showGrid ? styles.btnActive : styles.btn}
          onClick={() => toggleViewerShowGrid()}
        >
          ⊞
        </IconButton>
        {import.meta.env.DEV && (
          <IconButton
            label="UV lock debug"
            className={uvDebugMode ? styles.btnActive : styles.btn}
            onClick={() => setUvDebugMode(!uvDebugMode)}
          >
            UV
          </IconButton>
        )}
        <span className={styles.modeBadge} data-mode={interactionMode}>
          {interactionMode === "orbit" ? "Orbit" : "Paint"}
        </span>
      </div>
    </div>
  );
}
