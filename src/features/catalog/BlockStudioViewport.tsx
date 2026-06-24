import { useCallback } from "react";

import type { ProjectHandle, RenderableModel, VariantKey } from "../../ipc/types";
import { CAMERA_PRESETS } from "../../lib/cameraPresets";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore, CAMERA_PRESET_LABELS } from "../../state/viewerStore";
import { clearTextureCache, setActiveBiome } from "../viewer3d/textureLoader";
import { Scene3D } from "../viewer3d/Scene3D";
import { Select } from "../../ui/primitives/Select";
import { buildSelectedFaceFromModel } from "./modelFaceNav";
import styles from "./BlockStudioViewport.module.css";
import { TextureNavigator } from "./TextureNavigator";
import { useStudioFaceBootstrap } from "./useStudioFaceBootstrap";

const STUDIO_BIOMES = ["plains", "forest", "desert", "snowy"] as const;

interface BlockStudioViewportProps {
  model: RenderableModel;
  handle: ProjectHandle;
  displayName: string;
  variants: VariantKey[];
  variantKey: string | undefined;
  onVariantChange: (key: string) => void;
  biome: string;
  onBiomeChange: (biome: string) => void;
  isItem?: boolean;
}

export function BlockStudioViewport({
  model,
  handle,
  displayName,
  variants,
  variantKey,
  onVariantChange,
  biome,
  onBiomeChange,
  isItem = false,
}: BlockStudioViewportProps) {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);

  useStudioFaceBootstrap(model);

  const handleSelectFace = useCallback(
    (cuboidIndex: number, faceIndex: number) => {
      const face = buildSelectedFaceFromModel(model, cuboidIndex, faceIndex);
      if (!face) return;
      setSelectedFace(face);
      if (interactionMode !== "orbit") {
        setInteractionMode("paint");
      }
    },
    [model, setSelectedFace, setInteractionMode, interactionMode],
  );

  const handleBiomeChange = useCallback(
    (next: string) => {
      onBiomeChange(next);
      setActiveBiome(next);
      clearTextureCache(handle);
    },
    [handle, onBiomeChange],
  );

  const cameraPresets = isItem
    ? CAMERA_PRESETS.filter(
        (p) => p.id === "inventory" || p.id === "iso" || p.id === "front",
      )
    : CAMERA_PRESETS;

  return (
    <div className={styles.studio} data-tour="tour-studio-viewport">
      <div className={styles.toolbar}>
        <span className={styles.title}>{displayName}</span>
        {variants.length > 1 ? (
          <Select
            className={styles.variantSelect}
            value={variantKey ?? ""}
            aria-label="Block variant"
            onChange={(e) => onVariantChange(e.target.value)}
          >
            {variants.map((variant) => (
              <option key={variant.key} value={variant.key}>
                {variant.key || "(default)"}
                {variant.weight ? ` (w${variant.weight})` : ""}
              </option>
            ))}
          </Select>
        ) : null}
        <div className={styles.biomes} role="group" aria-label="Biome tint">
          {STUDIO_BIOMES.map((name) => (
            <button
              key={name}
              type="button"
              className={biome === name ? styles.biomeActive : styles.biomeBtn}
              onClick={() => handleBiomeChange(name)}
              aria-pressed={biome === name}
              title={`Biome: ${name}`}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={interactionMode === "orbit" ? styles.modeActive : styles.modeBtn}
          onClick={() => setInteractionMode("orbit")}
          aria-pressed={interactionMode === "orbit"}
        >
          Orbit
        </button>
        <button
          type="button"
          className={interactionMode === "paint" ? styles.modeActive : styles.modeBtn}
          onClick={() => setInteractionMode("paint")}
          aria-pressed={interactionMode === "paint"}
        >
          Paint
        </button>
        <div className={styles.presets}>
          {cameraPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetBtn}
              data-active={cameraPreset === preset.id}
              onClick={() => setCameraPreset(preset.id)}
              title={`${CAMERA_PRESET_LABELS[preset.id]} (${preset.hotkey})`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.canvasArea}>
        <Scene3D model={model} handle={handle} />
        <p className={styles.hintBar}>
          {interactionMode === "paint"
            ? "Click a face to paint · use texture chips below to switch faces"
            : "Orbit to inspect · switch to Paint to edit faces"}
        </p>
      </div>

      <TextureNavigator
        model={model}
        selectedFace={selectedFace}
        onSelectFace={handleSelectFace}
      />
    </div>
  );
}
