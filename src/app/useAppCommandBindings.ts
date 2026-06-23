import { useCallback, useMemo } from "react";

import { useAppCommands } from "../commands/useAppCommands";
import { exportViewerScreenshot } from "../lib/exportScreenshot";
import { ipc } from "../ipc/client";
import { useEditorStore } from "../state/editorStore";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";
import { useViewerStore } from "../state/viewerStore";

interface SaveWorkflowApi {
  handleSave: () => Promise<void>;
  handleRestoreBackup: () => Promise<void>;
  setSaveDialogOpen: (open: boolean) => void;
  setBackupDialogOpen: (open: boolean) => void;
  canSave: boolean;
}

interface ProjectSourceApi {
  openJar: () => Promise<void>;
  openFolder: () => Promise<void>;
  openSource: (path: string) => Promise<boolean>;
}

export function useAppCommandBindings(
  projectSource: ProjectSourceApi,
  saveWorkflow: SaveWorkflowApi,
  onOpenSettings: () => void,
) {
  const appInfo = useProjectStore((s) => s.appInfo);
  const handle = useProjectStore((s) => s.handle);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const clearRecentProjects = useSettingsStore((s) => s.clearRecentProjects);
  const setTool = useEditorStore((s) => s.setTool);
  const toggleComparator = useEditorStore((s) => s.toggleComparator);
  const toggleInteractionMode = useSelectionStore((s) => s.toggleInteractionMode);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const openShortcutsHelp = useUiStore((s) => s.openShortcutsHelp);
  const requestExplorerFocus = useUiStore((s) => s.requestExplorerFocus);
  const pushToast = useUiStore((s) => s.pushToast);

  const handleExportScreenshot = useCallback(() => {
    const ok = exportViewerScreenshot();
    if (ok) {
      pushToast("Screenshot exported", "success");
    } else {
      pushToast("No 3D view to capture", "error");
    }
  }, [pushToast]);

  const handleOpenLogs = useCallback(async () => {
    try {
      await ipc.revealLogDir();
      pushToast("Opened log folder", "info");
    } catch (error) {
      pushToast(
        error instanceof Error ? error.message : "Failed to open log folder",
        "error",
      );
    }
  }, [pushToast]);

  const handleAbout = useCallback(async () => {
    try {
      const info = appInfo ?? (await ipc.getAppInfo());
      const logLine = info.logDir ? `\nLogs: ${info.logDir}` : "";
      pushToast(
        `${info.name} v${info.version} · ${info.target} · ${info.profile}${logLine}`,
        "info",
      );
    } catch {
      pushToast("inD3X Art — Minecraft Asset Studio", "info");
    }
  }, [appInfo, pushToast]);

  const commandHandlers = useMemo(
    () => ({
      onOpenJar: () => void projectSource.openJar(),
      onOpenFolder: () => void projectSource.openFolder(),
      onOpenPath: (path: string) => void projectSource.openSource(path),
      onSave: () => void saveWorkflow.handleSave(),
      onSaveAs: () => saveWorkflow.setSaveDialogOpen(true),
      onRestoreBackup: () => void saveWorkflow.handleRestoreBackup(),
      onOpenBackupManager: () => saveWorkflow.setBackupDialogOpen(true),
      onOpenSettings,
      onToggleComparator: toggleComparator,
      onSetCameraPreset: setCameraPreset,
      onToggleTheme: toggleTheme,
      onTogglePaintMode: toggleInteractionMode,
      onSetTool: setTool,
      onFocusExplorer: requestExplorerFocus,
      onExportScreenshot: handleExportScreenshot,
      onShowShortcuts: openShortcutsHelp,
      onOpenCommandPalette: openCommandPalette,
      onOpenLogs: () => void handleOpenLogs(),
      onAbout: () => void handleAbout(),
      onClearRecent: () => {
        clearRecentProjects();
        pushToast("Recent projects cleared", "info");
      },
      canSave: saveWorkflow.canSave,
      hasProject: Boolean(handle),
    }),
    [
      projectSource,
      saveWorkflow,
      toggleComparator,
      setCameraPreset,
      toggleTheme,
      toggleInteractionMode,
      setTool,
      requestExplorerFocus,
      handleExportScreenshot,
      openShortcutsHelp,
      openCommandPalette,
      handleOpenLogs,
      handleAbout,
      clearRecentProjects,
      pushToast,
      handle,
      onOpenSettings,
    ],
  );

  return useAppCommands(commandHandlers);
}
