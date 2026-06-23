import { useCallback, useEffect, useState } from "react";

import type { RenderableModel } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import {
  useViewerStore,
  type CameraPreset,
  CAMERA_PRESET_LABELS,
} from "../../state/viewerStore";
import { ViewerAssetLoader, type ViewerAssetState } from "./ViewerAssetLoader";
import { Scene3D } from "./Scene3D";
import {
  BIOME_TINT_PALETTES,
  clearTextureCache,
  setActiveBiome,
  getActiveBiome,
} from "./textureLoader";
import styles from "./ViewerPanel.module.css";

const BIOME_NAMES = Object.keys(BIOME_TINT_PALETTES);

const DISPLAY_SLOTS = [
  "gui",
  "fixed",
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "firstperson_righthand",
  "firstperson_lefthand",
  "head",
  "ground",
] as const;

const CAMERA_PRESETS: { id: CameraPreset; label: string; hotkey: string }[] = [
  { id: "iso", label: "Iso", hotkey: "1" },
  { id: "front", label: "Front", hotkey: "2" },
  { id: "top", label: "Top", hotkey: "3" },
  { id: "inventory", label: "GUI", hotkey: "4" },
];

const EMPTY_ASSET_STATE: ViewerAssetState = {
  renderable: null,
  linkedModels: [],
  variants: [],
  variantKey: undefined,
  loading: false,
  error: null,
};

export function ViewerPanel() {
  const handle = useProjectStore((s) => s.handle);
  const selectedAssetId = useProjectStore((s) => s.selectedAssetId);
  const assets = useProjectStore((s) => s.assets);
  const selected = assets.find((a) => a.id === selectedAssetId);

  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);
  const storeDisplaySlot = useViewerStore((s) => s.displaySlot);
  const setStoreDisplaySlot = useViewerStore((s) => s.setDisplaySlot);

  const [variantPick, setVariantPick] = useState<{
    assetId: string;
    key: string;
  } | null>(null);
  const [biome, setBiome] = useState(getActiveBiome());
  const [comparatorEnabled, setComparatorEnabled] = useState(false);
  const [beforeModel, setBeforeModel] = useState<RenderableModel | null>(null);
  const [assetState, setAssetState] = useState<ViewerAssetState>(EMPTY_ASSET_STATE);

  const variantOverride =
    selected && variantPick?.assetId === selected.id ? variantPick.key : undefined;

  const onLoaded = useCallback((state: ViewerAssetState) => {
    setAssetState(state);
  }, []);

  useEffect(() => {
    return () => {
      clearTextureCache();
    };
  }, []);

  useEffect(() => {
    if (!handle) clearTextureCache();
  }, [handle]);

  const { renderable, linkedModels, variants, variantKey, loading, error } = assetState;

  const faceCount = renderable?.cuboids.reduce((n, c) => n + c.faces.length, 0) ?? 0;

  const animatedCount = renderable
    ? Object.values(renderable.textureMeta).filter((m) => m.animation).length
    : 0;

  const loaderKey =
    selected && handle ? `${handle.id}:${selected.id}:${variantOverride ?? ""}` : "idle";

  return (
    <div className={styles.panel}>
      {selected && handle && (
        <ViewerAssetLoader
          key={loaderKey}
          handle={handle}
          selected={selected}
          variantKey={variantOverride}
          onLoaded={onLoaded}
        />
      )}
      <div className={styles.toolbar}>
        <span className={styles.badge}>3D Viewer</span>
        <span className={styles.hint}>
          {selected ? selected.displayName : "No selection"}
        </span>
        <div className={styles.toolbarActions}>
          {variants.length > 1 && selected && (
            <select
              className={styles.variantSelect}
              value={variantKey ?? ""}
              aria-label="Block variant"
              onChange={(e) =>
                setVariantPick({ assetId: selected.id, key: e.target.value })
              }
            >
              {variants.map((variant) => (
                <option key={variant.key} value={variant.key}>
                  {variant.key}
                </option>
              ))}
            </select>
          )}
          <select
            className={styles.variantSelect}
            value={biome}
            aria-label="Biome tint"
            title="Biome tint palette"
            onChange={(e) => {
              setBiome(e.target.value);
              setActiveBiome(e.target.value);
              clearTextureCache();
            }}
          >
            {BIOME_NAMES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {renderable && Object.keys(renderable.display).length > 0 && (
            <select
              className={styles.variantSelect}
              value={storeDisplaySlot}
              aria-label="Display slot"
              title="Item display slot"
              onChange={(e) =>
                setStoreDisplaySlot(e.target.value as typeof storeDisplaySlot)
              }
            >
              {DISPLAY_SLOTS.filter((s) => renderable.display[s]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <div className={styles.cameraPresets}>
            {CAMERA_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.presetBtn}
                data-active={cameraPreset === preset.id}
                onClick={() => setCameraPreset(preset.id)}
                title={`${CAMERA_PRESET_LABELS[preset.id]} (${preset.hotkey})`}
              >
                {preset.label}
                <span className={styles.presetHotkey}>{preset.hotkey}</span>
              </button>
            ))}
            <button
              type="button"
              className={styles.presetBtn}
              data-active={cameraPreset === "free"}
              onClick={() => setCameraPreset("free")}
              title="Free camera (5)"
            >
              Free
              <span className={styles.presetHotkey}>5</span>
            </button>
          </div>
          <button
            type="button"
            className={styles.presetBtn}
            data-active={comparatorEnabled}
            title="3D before/after comparator"
            onClick={() => {
              if (!comparatorEnabled && renderable) {
                setBeforeModel(renderable);
              }
              setComparatorEnabled((v) => !v);
            }}
          >
            Compare
          </button>
          <span className={styles.modeBadge} data-mode={interactionMode}>
            {interactionMode === "orbit" ? "Orbit" : "Paint"}
          </span>
        </div>
      </div>
      <div className={styles.stage}>
        <div className={styles.grid} aria-hidden />
        {!selected ? (
          <div className={styles.message}>
            <p>Select an asset in the explorer to preview its in-game model.</p>
          </div>
        ) : loading ? (
          <div className={styles.message}>
            <p>Resolving model…</p>
          </div>
        ) : error ? (
          <div className={styles.message}>
            <p className={styles.selectedTitle}>{selected.displayName}</p>
            <p className={styles.error}>{error}</p>
          </div>
        ) : renderable && handle ? (
          <>
            {comparatorEnabled && beforeModel ? (
              <div className={styles.comparator3d}>
                <div className={styles.comparatorPane}>
                  <span className={styles.comparatorLabel}>Before</span>
                  <Scene3D model={beforeModel} handle={handle} />
                </div>
                <div className={styles.comparatorDivider} />
                <div className={styles.comparatorPane}>
                  <span className={styles.comparatorLabel}>After</span>
                  <Scene3D model={renderable} handle={handle} />
                </div>
              </div>
            ) : (
              <Scene3D model={renderable} handle={handle} />
            )}
            <div className={styles.overlay}>
              <p className={styles.overlayTitle}>
                {renderable.modelId} · {renderable.kind}
              </p>
              <div className={styles.stats}>
                <span>{renderable.cuboids.length} cuboids</span>
                <span>{faceCount} faces</span>
                <span>{Object.keys(renderable.textureRefs).length} texture refs</span>
                {animatedCount > 0 && <span>{animatedCount} animated</span>}
              </div>
              {linkedModels.length > 0 && (
                <p className={styles.linkedHint}>
                  {linkedModels.length} linked model
                  {linkedModels.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
