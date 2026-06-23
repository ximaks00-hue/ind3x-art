import { useEffect, useMemo, useState } from "react";

import { AppDialogs } from "./app/AppDialogs";
import { useAppBootstrap } from "./app/useAppBootstrap";
import { useAppCommandBindings } from "./app/useAppCommandBindings";
import { useAppHotkeyBindings } from "./app/useAppHotkeyBindings";
import { useProjectSource } from "./app/useProjectSource";
import { useSaveWorkflow } from "./app/useSaveWorkflow";
import { EditorPanel } from "./features/editor/EditorPanel";
import { ExplorerPanel } from "./features/explorer/ExplorerPanel";
import { ViewerPanelLazy } from "./features/viewer3d/ViewerPanelLazy";
import { useEditorStore } from "./state/editorStore";
import { useProjectStore } from "./state/projectStore";
import { useSelectionStore } from "./state/selectionStore";
import { useUiStore } from "./state/uiStore";
import { CAMERA_PRESET_LABELS, useViewerStore } from "./state/viewerStore";
import { AppShell } from "./ui/AppShell/AppShell";
import { StatusBar } from "./ui/StatusBar/StatusBar";
import { TitleBar } from "./ui/TitleBar/TitleBar";

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveMessageOverride, setSaveMessageOverride] = useState<string | null>(null);

  const { appInfo, ipcHealthy } = useAppBootstrap();

  const { handle, indexStatus, indexProgress, indexStage, fromCache, sourcePath } =
    useProjectStore();

  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const editorZoom = useEditorStore((s) => s.zoom);
  const editorCursorX = useEditorStore((s) => s.cursorX);
  const editorCursorY = useEditorStore((s) => s.cursorY);
  const viewerFps = useViewerStore((s) => s.fps);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);

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

  const { opening, openJar, openFolder, openSource, subscribeSourceEvents } =
    useProjectSource(() => {
      setSaveMessageOverride(null);
    });

  useEffect(() => subscribeSourceEvents(), [subscribeSourceEvents]);

  const saveWorkflow = useSaveWorkflow({ openSource, opening });

  const commands = useAppCommandBindings(
    { openJar, openFolder, openSource },
    saveWorkflow,
    () => setSettingsOpen(true),
  );

  useAppHotkeyBindings(commands, saveWorkflow, !opening && !saveWorkflow.saving);

  const saveMessage = saveMessageOverride ?? saveWorkflow.saveMessage;

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
        leftPanel={<ExplorerPanel />}
        center={<ViewerPanelLazy />}
        rightPanel={<EditorPanel />}
        statusBar={
          <StatusBar
            version={appInfo?.version}
            ipcHealthy={ipcHealthy}
            indexStatus={indexStatus}
            indexProgress={indexProgress}
            interactionMode={interactionMode}
            cameraPreset={CAMERA_PRESET_LABELS[cameraPreset]}
            fps={viewerFps}
            saveMessage={saveMessage ?? undefined}
            indexStage={
              fromCache && indexStatus === "done" ? `${indexStage} (cache)` : indexStage
            }
            namespace={defaultSaveNamespace}
            zoom={editorZoom}
            cursorX={editorCursorX}
            cursorY={editorCursorY}
          />
        }
      />
      <AppDialogs
        commandPaletteOpen={commandPaletteOpen}
        shortcutsHelpOpen={shortcutsHelpOpen}
        saveDialogOpen={saveWorkflow.saveDialogOpen}
        backupDialogOpen={saveWorkflow.backupDialogOpen}
        settingsOpen={settingsOpen}
        dirtyCount={saveWorkflow.dirtyCount}
        defaultSaveNamespace={defaultSaveNamespace}
        handle={handle}
        commands={commands}
        onCloseCommandPalette={closeCommandPalette}
        onCloseShortcutsHelp={closeShortcutsHelp}
        onCloseSaveDialog={() => saveWorkflow.setSaveDialogOpen(false)}
        onCloseBackupDialog={() => saveWorkflow.setBackupDialogOpen(false)}
        onCloseSettings={() => setSettingsOpen(false)}
        onSaveDialogSubmit={(submit) => void saveWorkflow.handleSaveDialogSubmit(submit)}
        onBackupRestored={() => {
          if (sourcePath) void openSource(sourcePath);
        }}
      />
    </>
  );
}

export default App;
