import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { AppDialogs } from "./app/AppDialogs";
import { useAppBootstrap } from "./app/useAppBootstrap";
import { useAppCommandBindings } from "./app/useAppCommandBindings";
import { useAppHotkeyBindings } from "./app/useAppHotkeyBindings";
import { useProjectSource } from "./app/useProjectSource";
import { useSaveWorkflow } from "./app/useSaveWorkflow";
import type { ScreenshotExportOptions } from "./lib/exportScreenshot";
import { EditorPanel } from "./features/editor/EditorPanel";
import { CatalogPanelLazy } from "./features/catalog/CatalogPanelLazy";
import { useCatalogStore } from "./features/catalog/catalogStore";
import { formatFaceDirection, textureBasename } from "./app/studioStatusLabels";
import { ExplorerPanel } from "./features/explorer/ExplorerPanel";
import { ViewerPanelLazy } from "./features/viewer3d/ViewerPanelLazy";
import { getActiveLayerIndex } from "./features/editor/documentStore";
import { useDirtyTextureCount } from "./features/save/useDirtyTextures";
import { useEditorStore, TOOL_LABELS } from "./state/editorStore";
import { useProjectStore } from "./state/projectStore";
import { useSelectionStore } from "./state/selectionStore";
import { useSettingsStore } from "./state/settingsStore";
import { useUiStore } from "./state/uiStore";
import { CAMERA_PRESET_LABELS, useViewerStore } from "./state/viewerStore";
import { AppShell } from "./ui/AppShell/AppShell";
import { TooltipHints } from "./ui/Onboarding/TooltipHints";
import { SessionRestoreDialog } from "./ui/SessionRestore/SessionRestoreDialog";
import { StatusBar } from "./ui/StatusBar/StatusBar";
import { TitleBar } from "./ui/TitleBar/TitleBar";

const OnboardingTour = lazy(() =>
  import("./ui/Onboarding/OnboardingTour").then((m) => ({ default: m.OnboardingTour })),
);

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportScreenshotOpen, setExportScreenshotOpen] = useState(false);
  const [sessionRestoreDismissed, setSessionRestoreDismissed] = useState(false);

  const { ipcHealthy } = useAppBootstrap();

  const { handle, indexStatus, queryTotal, sourcePath } = useProjectStore();
  const lastSessionPath = useSettingsStore((s) => s.lastSessionPath);
  const incrementSessionCount = useSettingsStore((s) => s.incrementSessionCount);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const studioOnboardingCompleted = useSettingsStore((s) => s.studioOnboardingCompleted);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  const catalogSelectedEntry = useCatalogStore((s) => s.selectedEntry);
  const catalogTotal = useCatalogStore((s) => s.total);
  const catalogLoading = useCatalogStore((s) => s.loading);
  const catalogQueryError = useCatalogStore((s) => s.queryError);

  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const editorTool = useEditorStore((s) => s.tool);
  const editorZoom = useEditorStore((s) => s.zoom);
  const editorCursorX = useEditorStore((s) => s.cursorX);
  const editorCursorY = useEditorStore((s) => s.cursorY);
  const viewerFps = useViewerStore((s) => s.fps);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);
  const dirtyCount = useDirtyTextureCount();

  const editorRevision = useEditorStore((s) => s.revision);
  const layerInfo = useMemo(() => {
    if (!selectedFace) return null;
    void editorRevision;
    return getActiveLayerIndex(selectedFace.texturePath);
  }, [selectedFace, editorRevision]);

  const showOnboardingTour =
    workspaceMode === "studio" ? !studioOnboardingCompleted : !onboardingCompleted;

  const studioStatus = useMemo(() => {
    if (workspaceMode !== "studio") return null;
    return {
      workspaceLabel: "Studio",
      catalogTotal: indexStatus === "done" ? catalogTotal : undefined,
      catalogLoading,
      catalogQueryError,
      catalogEntryLabel: catalogSelectedEntry?.displayName ?? catalogSelectedEntry?.id,
      faceDirection: selectedFace
        ? formatFaceDirection(selectedFace.direction)
        : undefined,
      textureLabel: selectedFace ? textureBasename(selectedFace.texturePath) : undefined,
    };
  }, [
    workspaceMode,
    catalogSelectedEntry,
    selectedFace,
    catalogTotal,
    catalogLoading,
    catalogQueryError,
    indexStatus,
  ]);

  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const shortcutsHelpOpen = useUiStore((s) => s.shortcutsHelpOpen);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const closeCommandPalette = useUiStore((s) => s.closeCommandPalette);
  const closeShortcutsHelp = useUiStore((s) => s.closeShortcutsHelp);

  const defaultSaveNamespace = useMemo(() => {
    const path = selectedFace?.texturePath;
    if (!path) return undefined;
    const match = /^assets\/([^/]+)\//.exec(path);
    return match?.[1];
  }, [selectedFace?.texturePath]);

  const {
    opening,
    openJar,
    openFolder,
    openDemoPack,
    openSource,
    subscribeSourceEvents,
  } = useProjectSource();

  const openRecent = (path: string) => {
    void openSource(path);
  };

  useEffect(() => {
    incrementSessionCount();
  }, [incrementSessionCount]);

  useEffect(() => subscribeSourceEvents(), [subscribeSourceEvents]);

  const sessionRestoreOpen = Boolean(
    !handle && !opening && lastSessionPath && !sessionRestoreDismissed && ipcHealthy,
  );

  const saveWorkflow = useSaveWorkflow({ openSource, opening });

  const { commands, handleExportScreenshot } = useAppCommandBindings(
    { openJar, openFolder, openSource, openDemoPack },
    saveWorkflow,
    () => setSettingsOpen(true),
    () => setExportScreenshotOpen(true),
  );

  useAppHotkeyBindings(commands, saveWorkflow, !opening && !saveWorkflow.saving);

  const onExportScreenshot = (options: ScreenshotExportOptions) => {
    handleExportScreenshot(options);
  };

  return (
    <>
      <AppShell
        titleBar={
          <TitleBar
            onOpenJar={() => void openJar()}
            onOpenFolder={() => void openFolder()}
            onSave={() => void saveWorkflow.handleSave()}
            onOpenCommands={openCommandPalette}
            opening={opening}
            saving={saveWorkflow.saving}
            dirtyCount={saveWorkflow.dirtyCount}
          />
        }
        leftPanel={
          workspaceMode === "studio" ? (
            <CatalogPanelLazy />
          ) : (
            <ExplorerPanel
              onOpenJar={() => void openJar()}
              onOpenFolder={() => void openFolder()}
              onOpenRecent={openRecent}
              onTryDemo={() => void openDemoPack()}
            />
          )
        }
        center={
          <ViewerPanelLazy
            onOpenJar={() => void openJar()}
            onOpenFolder={() => void openFolder()}
            onOpenRecent={openRecent}
            onTryDemo={() => void openDemoPack()}
          />
        }
        rightPanel={<EditorPanel />}
        statusBar={
          <StatusBar
            ipcHealthy={ipcHealthy}
            assetCount={indexStatus === "done" ? queryTotal : undefined}
            indexStatus={indexStatus}
            workspaceLabel={studioStatus?.workspaceLabel}
            catalogTotal={studioStatus?.catalogTotal}
            catalogLoading={studioStatus?.catalogLoading}
            catalogQueryError={studioStatus?.catalogQueryError}
            catalogEntryLabel={studioStatus?.catalogEntryLabel}
            faceDirection={studioStatus?.faceDirection}
            textureLabel={studioStatus?.textureLabel}
            toolLabel={selectedFace ? TOOL_LABELS[editorTool] : undefined}
            layerIndex={layerInfo?.index}
            layerTotal={layerInfo?.total}
            dirtyCount={dirtyCount}
            zoom={selectedFace ? editorZoom : undefined}
            cursorX={selectedFace ? editorCursorX : undefined}
            cursorY={selectedFace ? editorCursorY : undefined}
            interactionMode={handle ? interactionMode : undefined}
            cameraPreset={handle ? CAMERA_PRESET_LABELS[cameraPreset] : undefined}
            fps={handle ? viewerFps : undefined}
          />
        }
      />
      <AppDialogs
        commandPaletteOpen={commandPaletteOpen}
        shortcutsHelpOpen={shortcutsHelpOpen}
        saveDialogOpen={saveWorkflow.saveDialogOpen}
        backupDialogOpen={saveWorkflow.backupDialogOpen}
        settingsOpen={settingsOpen}
        exportScreenshotOpen={exportScreenshotOpen}
        dirtyCount={saveWorkflow.dirtyCount}
        defaultSaveNamespace={defaultSaveNamespace}
        handle={handle}
        commands={commands}
        onCloseCommandPalette={closeCommandPalette}
        onCloseShortcutsHelp={closeShortcutsHelp}
        onCloseSaveDialog={() => saveWorkflow.setSaveDialogOpen(false)}
        onCloseBackupDialog={() => saveWorkflow.setBackupDialogOpen(false)}
        onCloseSettings={() => setSettingsOpen(false)}
        onCloseExportScreenshot={() => setExportScreenshotOpen(false)}
        onExportScreenshot={onExportScreenshot}
        onSaveDialogSubmit={(submit) => void saveWorkflow.handleSaveDialogSubmit(submit)}
        onBackupRestored={() => {
          if (sourcePath) void openSource(sourcePath);
        }}
      />
      {showOnboardingTour && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}
      <TooltipHints />
      <SessionRestoreDialog
        open={sessionRestoreOpen}
        path={lastSessionPath ?? ""}
        onConfirm={() => {
          if (lastSessionPath) void openSource(lastSessionPath);
        }}
        onDecline={() => {
          setSessionRestoreDismissed(true);
        }}
      />
    </>
  );
}

export default App;
