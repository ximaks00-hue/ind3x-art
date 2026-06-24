import { useCallback, useEffect, useState } from "react";
import { Channel } from "@tauri-apps/api/core";

import { rebuildProjectCatalog } from "../../app/services/catalogService";
import {
  invalidateProjectIndex,
  reindexProject,
  revealLogDir,
} from "../../app/services/projectService";
import { bumpProjectDataRevision } from "../../app/projectDataRevision";
import { useInteractionStore } from "../../state/interactionStore";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { useViewerStore } from "../../state/viewerStore";
import {
  syncViewerPreferencesFromSettings,
  useViewerShowGrid,
} from "../../state/viewerPreferencesSync";
import { useCatalogStore } from "../catalog/catalogStore";
import { BlockStudioViewport } from "../catalog/BlockStudioViewport";
import { catalogTotalCount } from "../catalog/catalogUtils";
import { useStudioAssetLoader } from "../catalog/useStudioAssetLoader";
import { WelcomeScreen } from "../../ui/WelcomeScreen/WelcomeScreen";
import { ViewerAssetLoader, type ViewerAssetState } from "./ViewerAssetLoader";
import { Scene3D } from "./Scene3D";
import { ViewerEmptyState } from "./ViewerEmptyState";
import { ViewerErrorState } from "./ViewerErrorState";
import { ViewerLoadingState } from "./ViewerLoadingState";
import { ViewerToolbar } from "./ViewerToolbar";
import { clearTextureCache, setActiveBiome } from "./textureLoader";
import { PanelErrorBoundary } from "../../ui/PanelErrorBoundary/PanelErrorBoundary";
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
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const catalogSelectedEntry = useCatalogStore((s) => s.selectedEntry);
  const selected = useProjectStore((s) => s.selectedAsset);

  return (
    <ViewerPanelBody
      handle={handle}
      selected={selected}
      catalogSelectedEntry={catalogSelectedEntry}
      workspaceMode={workspaceMode}
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
  catalogSelectedEntry,
  workspaceMode,
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: ViewerPanelProps & {
  handle: ReturnType<typeof useProjectStore.getState>["handle"];
  selected: ReturnType<typeof useProjectStore.getState>["selectedAsset"];
  catalogSelectedEntry: ReturnType<typeof useCatalogStore.getState>["selectedEntry"];
  workspaceMode: ReturnType<typeof useSettingsStore.getState>["workspaceMode"];
}) {
  const isStudio = workspaceMode === "studio";
  const catalogLoading = useCatalogStore((s) => s.loading);
  const catalogTotal = useCatalogStore((s) => s.total);
  const catalogFacets = useCatalogStore((s) => s.facets);
  const catalogQueryError = useCatalogStore((s) => s.queryError);
  const catalogFacetTotal = catalogTotalCount(catalogFacets);
  const effectiveCatalogTotal = Math.max(catalogTotal, catalogFacetTotal);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const indexProgress = useProjectStore((s) => s.indexProgress);
  const indexStage = useProjectStore((s) => s.indexStage);
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const setWorkspaceMode = useSettingsStore((s) => s.setWorkspaceMode);
  const pushToast = useUiStore((s) => s.pushToast);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const setComparatorMode = useInteractionStore((s) => s.setComparatorMode);

  const showGrid = useViewerShowGrid();
  const resetCamera = useViewerStore((s) => s.resetCamera);
  const setCurrentRenderable = useViewerStore((s) => s.setCurrentRenderable);

  const comparatorMode = useInteractionStore((s) => s.comparatorMode);
  const viewerBeforeModel = useInteractionStore((s) => s.viewerBeforeModel);

  const [biome, setBiome] = useState("plains");
  const [assetState, setAssetState] = useState<ViewerAssetState>(EMPTY_ASSET_STATE);
  const [studioVariantPick, setStudioVariantPick] = useState<{
    entryId: string;
    key: string;
  } | null>(null);
  const [classicVariantPick, setClassicVariantPick] = useState<{
    assetId: string;
    key: string;
  } | null>(null);
  const [linkedModelPick, setLinkedModelPick] = useState<{
    assetId: string;
    path: string;
  } | null>(null);
  const [loadRetryTick, setLoadRetryTick] = useState(0);

  const studioVariantKey =
    studioVariantPick?.entryId === catalogSelectedEntry?.id && studioVariantPick
      ? studioVariantPick.key
      : (catalogSelectedEntry?.defaultVariantKey ?? undefined);

  const studioAsset = useStudioAssetLoader(
    isStudio ? handle : null,
    isStudio ? catalogSelectedEntry : null,
    studioVariantKey,
    loadRetryTick,
  );

  useEffect(() => {
    syncViewerPreferencesFromSettings();
  }, []);

  useEffect(() => {
    setActiveBiome(biome);
  }, [biome]);

  useEffect(() => {
    resetCamera();
    setCurrentRenderable(null);
  }, [resetCamera, setCurrentRenderable]);

  useEffect(() => {
    if (isStudio) {
      setCurrentRenderable(studioAsset.renderable);
    }
  }, [isStudio, studioAsset.renderable, setCurrentRenderable]);

  const classicVariantOverride =
    classicVariantPick && classicVariantPick.assetId === selected?.id
      ? classicVariantPick.key
      : undefined;

  const { renderable, linkedModels, variants, variantKey, loading, error } = isStudio
    ? {
        renderable: studioAsset.renderable,
        linkedModels: [] as ViewerAssetState["linkedModels"],
        variants: studioAsset.variants,
        variantKey: studioAsset.variantKey,
        loading: studioAsset.loading,
        error: studioAsset.error,
      }
    : assetState;

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

  const classicLoaderKey =
    selected && handle && !isStudio
      ? `${handle.id}:${selected.id}:${classicVariantOverride ?? ""}:${linkedModelOverride ?? ""}:${loadRetryTick}`
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
    void revealLogDir();
  }, []);

  const handleStudioRetry = useCallback(() => {
    setStudioVariantPick(null);
    setLoadRetryTick((t) => t + 1);
  }, []);

  const handleOpenClassic = useCallback(() => {
    setWorkspaceMode("classic");
    pushToast("Switched to Classic mode", "info");
  }, [pushToast, setWorkspaceMode]);

  const catalogLanguage = useSettingsStore((s) => s.catalogLanguage);
  const handleRetryCatalog = useCallback(() => {
    const currentHandle = useProjectStore.getState().handle;
    if (!currentHandle) return;
    pushToast("Rebuilding catalog…", "info");
    const onEvent = new Channel();
    void (async () => {
      try {
        await invalidateProjectIndex(currentHandle);
        await reindexProject(currentHandle, onEvent, null);
        await rebuildProjectCatalog(currentHandle, catalogLanguage);
        bumpProjectDataRevision();
        pushToast("Catalog rebuilt", "success");
      } catch {
        pushToast("Catalog rebuild failed", "error");
      }
    })();
  }, [pushToast, catalogLanguage]);

  const hasSelection = isStudio ? Boolean(catalogSelectedEntry) : Boolean(selected);
  const displayName = isStudio
    ? (catalogSelectedEntry?.displayName ?? "No selection")
    : (selected?.displayName ?? "No selection");
  const isIndexing = indexStatus === "running";
  const indexingLabel = indexStage
    ? `${indexStage}… ${indexProgress}%`
    : `Indexing… ${indexProgress}%`;

  return (
    <div className={styles.panelHost}>
    <div className={styles.panel} data-tour="tour-viewer hint-viewer">
      {!isStudio && selected && handle && (
        <ViewerAssetLoader
          key={classicLoaderKey}
          handle={handle}
          selected={selected}
          variantKey={classicVariantOverride}
          linkedModelPath={linkedModelOverride}
          onLoaded={onLoaded}
        />
      )}

      <div className={styles.header}>
        <span className={styles.badge}>{isStudio ? "Studio" : "3D Viewer"}</span>
        <span className={styles.hint}>
          {isStudio
            ? catalogSelectedEntry
              ? catalogSelectedEntry.displayName
              : catalogLoading
                ? "Loading catalog…"
                : effectiveCatalogTotal === 0
                  ? "Catalog empty — try Rebuild"
                  : "Pick a block from the catalog on the left"
            : displayName}
        </span>
      </div>

      {!isStudio ? (
        <ViewerToolbar
          handle={handle}
          selected={selected}
          renderable={renderable}
          variants={variants}
          variantKey={variantKey}
          linkedModels={linkedModels}
          linkedModelPath={linkedSelectValue}
          biome={biome}
          onVariantChange={(key) =>
            selected && setClassicVariantPick({ assetId: selected.id, key })
          }
          onLinkedModelChange={(path) =>
            selected && setLinkedModelPick({ assetId: selected.id, path })
          }
          onBiomeChange={setBiome}
          hidden={false}
        />
      ) : null}

      <div className={styles.stage}>
        {showGrid && <div className={styles.grid} aria-hidden />}
        {isIndexing ? (
          <ViewerLoadingState label={indexingLabel} />
        ) : !handle ? (
          <WelcomeScreen
            variant="hero"
            recentProjects={recentProjects}
            onOpenJar={() => onOpenJar?.()}
            onOpenFolder={() => onOpenFolder?.()}
            onOpenRecent={onOpenRecent}
            onTryDemo={onTryDemo}
          />
        ) : !hasSelection ? (
          isStudio &&
          !catalogQueryError &&
          (catalogLoading || (effectiveCatalogTotal === 0 && indexStatus === "done")) ? (
            <ViewerLoadingState
              label={catalogLoading ? "Loading catalog…" : "Preparing catalog…"}
            />
          ) : (
          <ViewerEmptyState
            onOpenJar={() => onOpenJar?.()}
            onOpenFolder={() => onOpenFolder?.()}
            studioMode={isStudio}
            catalogTotal={effectiveCatalogTotal}
            onOpenClassic={isStudio ? handleOpenClassic : undefined}
            onRetryCatalog={isStudio ? handleRetryCatalog : undefined}
          />
          )
        ) : isStudio && catalogSelectedEntry && handle ? (
          <PanelErrorBoundary name="Block Studio">
          <BlockStudioViewport
            model={renderable}
            handle={handle}
            entry={catalogSelectedEntry}
            variants={variants}
            variantKey={variantKey}
            onVariantChange={(key) =>
              catalogSelectedEntry &&
              setStudioVariantPick({ entryId: catalogSelectedEntry.id, key })
            }
            biome={biome}
            onBiomeChange={setBiome}
            resolveLoading={loading}
            resolveError={error}
          />
          </PanelErrorBoundary>
        ) : loading ? (
          <ViewerLoadingState />
        ) : error ? (
          <ViewerErrorState
            title={displayName}
            error={error}
            isTexture={!isStudio && selected?.kind === "texture"}
            hasLinkedModels={linkedModels.length > 0}
            studioMode={isStudio}
            onRetry={isStudio ? handleStudioRetry : undefined}
            onOpenClassic={isStudio ? handleOpenClassic : undefined}
            onShowFlatPreview={
              !isStudio &&
              (selected?.kind === "texture" || selected?.kind === "blockModel")
                ? handleShowFlatPreview
                : undefined
            }
            onPickModel={linkedModels.length > 0 ? handlePickModel : undefined}
            onReportIssue={handleReportIssue}
          />
        ) : renderable && handle ? (
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
        ) : hasSelection && handle ? (
          <ViewerLoadingState label="Preparing preview…" />
        ) : null}
      </div>
    </div>
    </div>
  );
}
