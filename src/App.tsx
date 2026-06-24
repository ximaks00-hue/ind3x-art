import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { AppDialogs } from "./app/AppDialogs";
import { useAppBootstrap } from "./app/useAppBootstrap";
import { useAppCommandBindings } from "./app/useAppCommandBindings";
import { useAppHotkeyBindings } from "./app/useAppHotkeyBindings";
import { useAppStatusBar } from "./app/useAppStatusBar";
import { useProjectSource } from "./app/useProjectSource";
import { useSaveWorkflow } from "./app/useSaveWorkflow";
import { clearTextureDocuments } from "./features/editor/textureDocument";
import type { ScreenshotExportOptions } from "./lib/exportScreenshot";
import { EditorPanel } from "./features/editor/EditorPanel";
import { useCatalogBootstrap } from "./features/catalog/useCatalogBootstrap";
import { ExplorerPanel } from "./features/explorer/ExplorerPanel";
import { ViewerPanel } from "./features/viewer3d/ViewerPanel";
import { useProjectStore } from "./state/projectStore";
import { useSelectionStore } from "./state/selectionStore";
import { useSettingsStore } from "./state/settingsStore";
import { useUiStore } from "./state/uiStore";
import { AppShell } from "./ui/AppShell/AppShell";
import { shouldShowOnboardingTour } from "./ui/Onboarding/onboardingSteps";
import { ProjectOpenOverlay } from "./ui/ProjectOpenOverlay/ProjectOpenOverlay";
import { SessionRestoreDialog } from "./ui/SessionRestore/SessionRestoreDialog";
import { StatusBar } from "./ui/StatusBar/StatusBar";
import { TitleBar } from "./ui/TitleBar/TitleBar";
import { TooltipHints } from "./ui/Onboarding/TooltipHints";

const OnboardingTour = lazy(() =>
  import("./ui/Onboarding/OnboardingTour").then((m) => ({ default: m.OnboardingTour })),
);

const CatalogPanel = lazy(() =>
  import("./features/catalog/CatalogPanel").then((m) => ({ default: m.CatalogPanel })),
);

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportScreenshotOpen, setExportScreenshotOpen] = useState(false);
  const [sessionRestoreDismissed, setSessionRestoreDismissed] = useState(false);

  const { ipcHealthy } = useAppBootstrap();
  const statusBar = useAppStatusBar();

  const { handle, indexStatus, indexProgress, indexStage, sourcePath } = useProjectStore();
  const lastSessionPath = useSettingsStore((s) => s.lastSessionPath);
  const incrementSessionCount = useSettingsStore((s) => s.incrementSessionCount);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const studioOnboardingCompleted = useSettingsStore((s) => s.studioOnboardingCompleted);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  const selectedFace = useSelectionStore((s) => s.selectedFace);

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

  useCatalogBootstrap();

  const showOnboardingTour = shouldShowOnboardingTour({
    workspaceMode,
    studioOnboardingCompleted,
    onboardingCompleted,
    hasOpenProject: Boolean(handle),
    opening,
    indexStatus,
  });

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
      {(opening || indexStatus === "running") && (
        <ProjectOpenOverlay stage={indexStage} progress={indexProgress} />
      )}
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
            <Suspense fallback={null}>
              <CatalogPanel />
            </Suspense>
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
          <ViewerPanel
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
            assetCount={statusBar.assetCount}
            indexStatus={statusBar.indexStatus}
            workspaceLabel={statusBar.studioStatus?.workspaceLabel}
            catalogTotal={statusBar.studioStatus?.catalogTotal}
            catalogLoading={statusBar.studioStatus?.catalogLoading}
            catalogQueryError={statusBar.studioStatus?.catalogQueryError}
            catalogEntryLabel={statusBar.studioStatus?.catalogEntryLabel}
            faceDirection={statusBar.studioStatus?.faceDirection}
            textureLabel={statusBar.studioStatus?.textureLabel}
            textureDirty={statusBar.studioStatus?.textureDirty}
            studioCompact={statusBar.studioCompact}
            toolLabel={statusBar.toolLabel}
            layerIndex={statusBar.layerIndex}
            layerTotal={statusBar.layerTotal}
            dirtyCount={statusBar.dirtyCount}
            zoom={statusBar.zoom}
            cursorX={statusBar.cursorX}
            cursorY={statusBar.cursorY}
            interactionMode={statusBar.interactionMode}
            cameraPreset={statusBar.cameraPreset}
            fps={statusBar.fps}
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
          clearTextureDocuments();
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
