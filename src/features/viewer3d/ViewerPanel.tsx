import { useCallback, useEffect, useState } from "react";

import { ipc } from "../../ipc/client";
import { useInteractionStore } from "../../state/interactionStore";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { useViewerStore } from "../../state/viewerStore";
import { syncViewerPreferencesFromSettings } from "../../state/viewerPreferencesSync";
import { useCatalogStore } from "../catalog/catalogStore";
import { BlockStudioViewport } from "../catalog/BlockStudioViewport";
import { WelcomeScreen } from "../../ui/WelcomeScreen/WelcomeScreen";
import { ViewerAssetLoader, type ViewerAssetState } from "./ViewerAssetLoader";
import { Scene3D } from "./Scene3D";
import { ViewerEmptyState } from "./ViewerEmptyState";
import { ViewerErrorState } from "./ViewerErrorState";
import { ViewerLoadingState } from "./ViewerLoadingState";
import { ViewerToolbar } from "./ViewerToolbar";
import { clearTextureCache } from "./textureLoader";
import styles from "./ViewerPanel.module.css";

const EMPTY_ASSET_STATE: ViewerAssetState = {
  renderable: null,
  linkedModels: [],
  variants: [],
  variantKey: undefined,
  loading: false,
  error: null,
};

interface ViewerPanelProps {
  onOpenJar?: () => void;
  onOpenFolder?: () => void;
  onOpenRecent?: (path: string, kind: "jar" | "folder") => void;
  onTryDemo?: () => void;
}

export function ViewerPanel({
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: ViewerPanelProps) {
  const handle = useProjectStore((s) => s.handle);
  const selected = useProjectStore((s) => s.selectedAsset);

  return (
    <ViewerPanelBody
      key={selected?.id ?? "_none"}
      handle={handle}
      selected={selected}
      onOpenJar={onOpenJar}
      onOpenFolder={onOpenFolder}
      onOpenRecent={onOpenRecent}
      onTryDemo={onTryDemo}
    />
  );
}

function ViewerPanelBody({
  handle,
  selected,
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: ViewerPanelProps & {
  handle: ReturnType<typeof useProjectStore.getState>["handle"];
  selected: ReturnType<typeof useProjectStore.getState>["selectedAsset"];
}) {
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const setWorkspaceMode = useSettingsStore((s) => s.setWorkspaceMode);
  const catalogSelectedEntry = useCatalogStore((s) => s.selectedEntry);
  const pushToast = useUiStore((s) => s.pushToast);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setComparatorMode = useInteractionStore((s) => s.setComparatorMode);

  const showGrid = useViewerStore((s) => s.showGrid);
  const resetCamera = useViewerStore((s) => s.resetCamera);
  const setCurrentRenderable = useViewerStore((s) => s.setCurrentRenderable);

  const comparatorMode = useInteractionStore((s) => s.comparatorMode);
  const viewerBeforeModel = useInteractionStore((s) => s.viewerBeforeModel);

  const [biome, setBiome] = useState("plains");
  const [assetState, setAssetState] = useState<ViewerAssetState>(EMPTY_ASSET_STATE);

  useEffect(() => {
    syncViewerPreferencesFromSettings();
  }, []);

  useEffect(() => {
    resetCamera();
    setCurrentRenderable(null);
  }, [resetCamera, setCurrentRenderable]);

  const [variantPick, setVariantPick] = useState<{
    assetId: string;
    key: string;
  } | null>(null);
  const [linkedModelPick, setLinkedModelPick] = useState<{
    assetId: string;
    path: string;
  } | null>(null);
  const [loadRetryTick, setLoadRetryTick] = useState(0);

  const variantOverride =
    variantPick && variantPick.assetId === selected?.id
      ? variantPick.key
      : workspaceMode === "studio" &&
          catalogSelectedEntry &&
          selected?.path === catalogSelectedEntry.sourcePath
        ? (catalogSelectedEntry.defaultVariantKey ?? undefined)
        : undefined;

  const { renderable, linkedModels, variants, variantKey, loading, error } = assetState;

  const linkedModelOverride =
    linkedModelPick?.path ??
    (selected?.kind === "texture" && linkedModels.length >= 3
      ? linkedModels[0]?.path
      : undefined);

  const onLoaded = useCallback(
    (state: ViewerAssetState) => {
      setAssetState(state);
      setCurrentRenderable(state.renderable);
    },
    [setCurrentRenderable],
  );

  useEffect(() => {
    return () => {
      clearTextureCache();
      setCurrentRenderable(null);
    };
  }, [setCurrentRenderable]);

  useEffect(() => {
    if (!handle) clearTextureCache();
  }, [handle]);

  const faceCount = renderable?.cuboids.reduce((n, c) => n + c.faces.length, 0) ?? 0;
  const animatedCount = renderable
    ? Object.values(renderable.textureMeta).filter((m) => m.animation).length
    : 0;

  const loaderKey =
    selected && handle
      ? `${handle.id}:${selected.id}:${variantOverride ?? ""}:${linkedModelOverride ?? ""}:${loadRetryTick}`
      : "idle";

  const linkedSelectValue = linkedModelPick?.path ?? linkedModels[0]?.path ?? "";

  const handleShowFlatPreview = useCallback(() => {
    setInteractionMode("paint");
    setComparatorMode("2d");
    pushToast("Switched to 2D flat compare — pick a face to preview", "info");
  }, [pushToast, setComparatorMode, setInteractionMode]);

  const handlePickModel = useCallback(() => {
    if (linkedModels.length > 0) {
      setLinkedModelPick({ assetId: selected!.id, path: linkedModels[0]!.path });
      pushToast("Try another linked model from the toolbar picker", "info");
    }
  }, [linkedModels, pushToast, selected]);

  const handleReportIssue = useCallback(() => {
    void ipc.revealLogDir();
  }, []);

  const handleStudioRetry = useCallback(() => {
    setAssetState(EMPTY_ASSET_STATE);
    setLoadRetryTick((t) => t + 1);
  }, []);

  const handleOpenClassic = useCallback(() => {
    setWorkspaceMode("classic");
    pushToast("Switched to Classic mode", "info");
  }, [pushToast, setWorkspaceMode]);

  return (
    <div className={styles.panel} data-tour="tour-viewer hint-viewer">
      {selected && handle && (
        <ViewerAssetLoader
          key={loaderKey}
          handle={handle}
          selected={selected}
          variantKey={variantOverride}
          linkedModelPath={linkedModelOverride}
          onLoaded={onLoaded}
        />
      )}

      {workspaceMode !== "studio" || !renderable ? (
        <div className={styles.header}>
          <span className={styles.badge}>3D Viewer</span>
          <span className={styles.hint}>
            {selected ? selected.displayName : "No selection"}
          </span>
        </div>
      ) : null}

      <ViewerToolbar
        selected={selected}
        renderable={renderable}
        variants={variants}
        variantKey={variantKey}
        linkedModels={linkedModels}
        linkedModelPath={linkedSelectValue}
        biome={biome}
        onVariantChange={(key) =>
          selected && setVariantPick({ assetId: selected.id, key })
        }
        onLinkedModelChange={(path) =>
          selected && setLinkedModelPick({ assetId: selected.id, path })
        }
        onBiomeChange={setBiome}
        hidden={workspaceMode === "studio"}
      />

      <div className={styles.stage}>
        {showGrid && <div className={styles.grid} aria-hidden />}
        {!handle ? (
          <WelcomeScreen
            variant="hero"
            recentProjects={recentProjects}
            onOpenJar={() => onOpenJar?.()}
            onOpenFolder={() => onOpenFolder?.()}
            onOpenRecent={onOpenRecent}
            onTryDemo={onTryDemo}
          />
        ) : !selected ? (
          <ViewerEmptyState
            onOpenJar={() => onOpenJar?.()}
            onOpenFolder={() => onOpenFolder?.()}
          />
        ) : loading ? (
          <ViewerLoadingState />
        ) : error ? (
          <ViewerErrorState
            title={selected.displayName}
            error={error}
            isTexture={selected.kind === "texture"}
            hasLinkedModels={linkedModels.length > 0}
            studioMode={workspaceMode === "studio"}
            onRetry={workspaceMode === "studio" ? handleStudioRetry : undefined}
            onOpenClassic={workspaceMode === "studio" ? handleOpenClassic : undefined}
            onShowFlatPreview={
              selected.kind === "texture" || selected.kind === "blockModel"
                ? handleShowFlatPreview
                : undefined
            }
            onPickModel={linkedModels.length > 0 ? handlePickModel : undefined}
            onReportIssue={handleReportIssue}
          />
        ) : renderable && handle ? (
          workspaceMode === "studio" ? (
            <BlockStudioViewport
              model={renderable}
              handle={handle}
              displayName={selected?.displayName ?? renderable.modelId}
              variants={variants}
              variantKey={variantKey}
              onVariantChange={(key) =>
                selected && setVariantPick({ assetId: selected.id, key })
              }
              biome={biome}
              onBiomeChange={setBiome}
              isItem={
                selected?.kind === "itemModel" ||
                renderable.kind === "itemGenerated" ||
                renderable.kind === "itemModel"
              }
            />
          ) : (
          <>
            {comparatorMode === "3d" && viewerBeforeModel ? (
              <div className={styles.comparator3d}>
                <div className={styles.comparatorPane}>
                  <span className={styles.comparatorLabel}>Before</span>
                  <Scene3D model={viewerBeforeModel} handle={handle} />
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
                  {linkedModels.length >= 3 ? " · use Model picker" : ""}
                </p>
              )}
            </div>
          </>
          )
        ) : null}
      </div>
    </div>
  );
}
