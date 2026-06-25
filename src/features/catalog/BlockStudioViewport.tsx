import { useCallback, useEffect, useState } from "react";

import type { CatalogEntry, ProjectHandle, RenderableModel, VariantKey } from "../../ipc/types";
import { useInteractionStore } from "../../state/interactionStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useViewerStore } from "../../state/viewerStore";
import { applyBiomeChange } from "../viewer3d/viewerTextureSync";
import { Compare3DViewport } from "../viewer3d/Compare3DViewport";
import { Scene3D } from "../viewer3d/Scene3D";
import { MiniSceneControl } from "../viewer3d/MiniSceneControl";
import { ViewerLoadingState } from "../viewer3d/ViewerLoadingState";
import { Select } from "../../ui/primitives/Select";
import { IconButton } from "../../ui/primitives/IconButton";
import { multipartSchematicLabel } from "./modelFaceNav";
import { FACE_PICK_CENTER_HINT } from "./faceEditingGuide";
import styles from "./BlockStudioViewport.module.css";
import { variantPickerLabel } from "./catalogUtils";
import { StudioTexturePreview } from "./StudioTexturePreview";
import { StudioAnimationPreview } from "./StudioAnimationPreview";
import { useStudioFaceBootstrap } from "./useStudioFaceBootstrap";
import { ModelFaceChrome } from "../viewer3d/ModelFaceChrome";
import { buildFullTextureSpriteFace } from "./textureFaceSelection";
import {
  defaultStudioItemView,
  entryPresentation,
  isItemPresentation,
  STUDIO_ITEM_VIEW_LABELS,
  studioCameraFor,
  studioDisplaySlotFor,
  studioItemViewOptions,
  type StudioItemView,
} from "./studioPresentation";

const STUDIO_BIOMES = ["plains", "forest", "desert", "snowy"] as const;

interface BlockStudioViewportProps {
  model: RenderableModel | null;
  handle: ProjectHandle;
  entry: CatalogEntry;
  variants: VariantKey[];
  variantKey: string | undefined;
  onVariantChange: (key: string) => void;
  biome: string;
  onBiomeChange: (biome: string) => void;
  resolveLoading?: boolean;
  resolveError?: string | null;
}

function texturePathForEntry(entry: CatalogEntry): string | null {
  return entry.texturePaths[0] ?? entry.studioModelPath ?? entry.sourcePath ?? null;
}

export function BlockStudioViewport({
  model,
  handle,
  entry,
  variants,
  variantKey,
  onVariantChange,
  biome,
  onBiomeChange,
  resolveLoading = false,
  resolveError = null,
}: BlockStudioViewportProps) {
  const presentation = entryPresentation(entry);
  const itemViewOptions = studioItemViewOptions(presentation);
  const [itemView, setItemView] = useState<StudioItemView>(defaultStudioItemView(presentation));
  const isTextureEntry = entry.resolveKind === "texture";

  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const activeTextureMeta = useViewerStore((s) => s.activeTextureMeta);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const setDisplaySlot = useViewerStore((s) => s.setDisplaySlot);
  const studioShowFloorGrid = useSettingsStore((s) => s.studioShowFloorGrid);
  const miniSceneEnabled = useSettingsStore((s) => s.miniSceneEnabled);
  const miniSceneSize = useSettingsStore((s) => s.miniSceneSize);
  const comparatorMode = useInteractionStore((s) => s.comparatorMode);
  const viewerBeforeModel = useInteractionStore((s) => s.viewerBeforeModel);
  const cycleComparator = useInteractionStore((s) => s.cycleComparator);
  const captureCompareBefore = useInteractionStore((s) => s.captureCompareBefore);

  const compareLabel =
    comparatorMode === "2d" ? "2D" : comparatorMode === "3d" ? "3D" : "Off";

  const schematicLabel = model ? multipartSchematicLabel(model) : null;
  const preferredDisplaySlot = studioDisplaySlotFor(presentation, itemView);
  const faceAnimMeta =
    model && selectedFace
      ? (model.textureMeta[selectedFace.texturePath]?.animation ?? null)
      : null;
  const faceTextureMeta =
    model && selectedFace ? model.textureMeta[selectedFace.texturePath] : undefined;

  useStudioFaceBootstrap(model, entry, itemView, variantKey);

  useEffect(() => {
    setItemView(defaultStudioItemView(presentation));
  }, [entry.id, presentation]);

  useEffect(() => {
    if (model || !isTextureEntry || interactionMode !== "paint") return;
    const path = texturePathForEntry(entry);
    if (!path) return;
    setSelectedFace(buildFullTextureSpriteFace(path, "up", activeTextureMeta[path]));
  }, [model, isTextureEntry, entry, setSelectedFace, interactionMode, activeTextureMeta]);

  useEffect(() => {
    if (!model || !isItemPresentation(presentation)) return;
    setCameraPreset(studioCameraFor(presentation, itemView));
    const slot = studioDisplaySlotFor(presentation, itemView);
    if (slot) setDisplaySlot(slot);
  }, [model, presentation, itemView, setCameraPreset, setDisplaySlot]);

  const handleBiomeChange = useCallback(
    (next: string) => {
      onBiomeChange(next);
      applyBiomeChange(handle, next);
    },
    [handle, onBiomeChange],
  );

  const linkedTexturePath = texturePathForEntry(entry);
  const hasLinkedTexture = Boolean(linkedTexturePath);
  const showFlatTexturePreview =
    isTextureEntry || (!model && hasLinkedTexture && !resolveLoading);
  const flatPreviewReason = isTextureEntry
    ? ("textureEntry" as const)
    : !model && resolveError && hasLinkedTexture
      ? ("resolveFailed" as const)
      : null;
  const show3d = Boolean(model) && !isTextureEntry;
  const showCenterPlaceholder =
    !show3d && !showFlatTexturePreview && !resolveLoading && !resolveError;

  return (
    <div className={styles.studio} data-tour="tour-studio-viewport">
      <div className={styles.toolbar}>
        <span className={styles.title}>
          {entry.displayName}
          {schematicLabel ? (
            <span className={styles.schematic}> · {schematicLabel}</span>
          ) : null}
        </span>
        {variants.length > 1 ? (
          <Select
            className={styles.variantSelect}
            value={variantKey ?? ""}
            aria-label="Block variant"
            onChange={(e) => onVariantChange(e.target.value)}
          >
            {variants.map((variant) => (
              <option key={variant.key || "__default"} value={variant.key}>
                {variantPickerLabel(variant)}
              </option>
            ))}
          </Select>
        ) : null}
        {itemViewOptions && model ? (
          <div className={styles.itemViews} role="group" aria-label="Item view">
            {itemViewOptions.map((view) => (
              <button
                key={view}
                type="button"
                className={itemView === view ? styles.modeActive : styles.modeBtn}
                onClick={() => setItemView(view)}
                aria-pressed={itemView === view}
              >
                {STUDIO_ITEM_VIEW_LABELS[view]}
              </button>
            ))}
          </div>
        ) : null}
        {faceAnimMeta && faceAnimMeta.frames.length > 0 && selectedFace ? (
          <StudioAnimationPreview
            texturePath={selectedFace.texturePath}
            animation={faceAnimMeta}
            textureMeta={faceTextureMeta}
          />
        ) : null}
        {model ? (
          <div className={styles.compareGroup} role="group" aria-label="Compare">
            <IconButton
              label="Cycle comparator: off → 2D editor → 3D split (C)"
              className={comparatorMode != null ? styles.compareActive : styles.compareBtn}
              onClick={() => cycleComparator(model)}
            >
              {compareLabel}
            </IconButton>
            <IconButton
              label="Capture before snapshot for 3D compare"
              className={styles.compareBtn}
              onClick={() => captureCompareBefore(model)}
            >
              📷
            </IconButton>
          </div>
        ) : null}
        {model ? (
          <div className={styles.miniScene} role="group" aria-label="Test scene">
            <MiniSceneControl />
          </div>
        ) : null}
        {model ? (
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
        ) : null}
      </div>

      <div className={styles.canvasArea}>
        {studioShowFloorGrid && model ? (
          <div className={styles.floorGrid} aria-hidden />
        ) : null}
        {showFlatTexturePreview ? (
          <StudioTexturePreview entry={entry} handle={handle} />
        ) : null}
        {flatPreviewReason ? (
          <div className={styles.previewBanner} role="status">
            {flatPreviewReason === "textureEntry" ? (
              <>
                <strong>Texture-only entry</strong>
                <span>
                  This mod item has no block model in the pack — edit the flat texture in the
                  panel on the right.
                </span>
              </>
            ) : (
              <>
                <strong>3D model unavailable</strong>
                <span>
                  Showing linked texture instead. Paint still works via the editor — try Hand or
                  Placed view if a model exists.
                </span>
              </>
            )}
          </div>
        ) : null}
        {resolveLoading ? (
          <div className={styles.resolveOverlay}>
            <ViewerLoadingState label="Resolving 3D model…" />
          </div>
        ) : null}
        {resolveError ? (
          <p className={styles.resolveError} role="alert">
            3D resolve: {resolveError}
          </p>
        ) : null}
        {showCenterPlaceholder ? (
          <div className={styles.centerPlaceholder} role="status">
            <span className={styles.centerPlaceholderTitle}>{entry.displayName}</span>
            <span className={styles.centerPlaceholderHint}>
              {resolveError
                ? "Preview unavailable — pick another entry or switch category"
                : "Waiting for preview…"}
            </span>
          </div>
        ) : null}
        {show3d && model && interactionMode === "paint" ? (
          <div className={styles.paintWorkflowBanner} role="status">
            {FACE_PICK_CENTER_HINT}
          </div>
        ) : null}
        {show3d && model ? (
          comparatorMode === "3d" && viewerBeforeModel ? (
            <Compare3DViewport
              className={styles.comparator3d}
              beforeModel={viewerBeforeModel}
              afterModel={model}
              handle={handle}
              sceneProps={{
                studioMode: true,
                preferredDisplaySlot,
                showVignette: true,
                miniSceneEnabled,
                miniSceneSize,
              }}
            />
          ) : (
            <Scene3D
              model={model}
              handle={handle}
              studioMode
              preferredDisplaySlot={preferredDisplaySlot}
              showVignette
              miniSceneEnabled={miniSceneEnabled}
              miniSceneSize={miniSceneSize}
            />
          )
        ) : null}
      </div>

      {model ? <ModelFaceChrome model={model} /> : null}
    </div>
  );
}
