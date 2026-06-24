import { useCallback, useEffect, useState } from "react";

import type { CatalogEntry, ProjectHandle, RenderableModel, VariantKey } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useViewerStore } from "../../state/viewerStore";
import { applyBiomeChange } from "../viewer3d/viewerTextureSync";
import { Scene3D } from "../viewer3d/Scene3D";
import { ViewerLoadingState } from "../viewer3d/ViewerLoadingState";
import { Select } from "../../ui/primitives/Select";
import { buildSelectedFaceFromModel, multipartSchematicLabel } from "./modelFaceNav";
import styles from "./BlockStudioViewport.module.css";
import { variantPickerLabel } from "./catalogUtils";
import { StudioTexturePreview } from "./StudioTexturePreview";
import { TextureNavigator } from "./TextureNavigator";
import { UnfoldPanel } from "./UnfoldPanel";
import { StudioAnimationPreview } from "./StudioAnimationPreview";
import { useStudioFaceBootstrap } from "./useStudioFaceBootstrap";
import { useStudioFaceHotkeys } from "./useStudioFaceHotkeys";
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
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const setDisplaySlot = useViewerStore((s) => s.setDisplaySlot);
  const studioShowFloorGrid = useSettingsStore((s) => s.studioShowFloorGrid);
  const setRightPanelCollapsed = useSettingsStore((s) => s.setRightPanelCollapsed);

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
    setRightPanelCollapsed(false);
    setInteractionMode("paint");
  }, [entry.id, setRightPanelCollapsed, setInteractionMode]);

  useEffect(() => {
    if (model || !isTextureEntry) return;
    const path = texturePathForEntry(entry);
    if (!path) return;
    setSelectedFace({
      cuboidIndex: 0,
      faceIndex: 0,
      direction: "up",
      texturePath: path,
      uv: [0, 0, 16, 16],
      rotation: 0,
      tintindex: -1,
      hitUv: [0.5, 0.5],
      pixel: [8, 8],
    });
  }, [model, isTextureEntry, entry, setSelectedFace]);

  useEffect(() => {
    if (!model || !isItemPresentation(presentation)) return;
    setCameraPreset(studioCameraFor(presentation, itemView));
    const slot = studioDisplaySlotFor(presentation, itemView);
    if (slot) setDisplaySlot(slot);
  }, [model, presentation, itemView, setCameraPreset, setDisplaySlot]);

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

  useStudioFaceHotkeys(model, handleSelectFace);

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
  const isItemGuiView =
    Boolean(model) &&
    isItemPresentation(presentation) &&
    itemView === "gui" &&
    (model?.kind === "itemGenerated" || presentation === "item" || presentation === "tool");

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
        {model ? (
          <>
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
          </>
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
        {show3d && model ? (
          <Scene3D
            model={model}
            handle={handle}
            studioMode
            preferredDisplaySlot={preferredDisplaySlot}
            showVignette
          />
        ) : null}
        <p className={styles.hintBar}>
          {flatPreviewReason === "textureEntry"
            ? "Flat texture preview — paint in the panel on the right"
            : flatPreviewReason === "resolveFailed"
              ? "Flat fallback — 3D resolve failed; editor paint is still active"
              : isItemGuiView
                ? "GUI view — click a face on the icon; switch to Hand for easier sword/tool paint"
                : interactionMode === "paint"
                  ? "Click a face to paint · 1–6 jump to faces · texture chips below"
                  : "Orbit to inspect · switch to Paint to edit faces"}
        </p>
      </div>

      {model ? (
        <>
          <UnfoldPanel
            model={model}
            selectedFace={selectedFace}
            onSelectFace={handleSelectFace}
          />
          <TextureNavigator
            model={model}
            selectedFace={selectedFace}
            onSelectFace={handleSelectFace}
          />
        </>
      ) : null}
    </div>
  );
}
