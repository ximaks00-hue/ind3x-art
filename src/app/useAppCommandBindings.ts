import { useCallback, useMemo } from "react";

import { useAppCommands } from "../commands/useAppCommands";
import {
  exportViewerScreenshot,
  type ScreenshotExportOptions,
} from "../lib/exportScreenshot";
import { downloadShortcutsExport } from "../lib/shortcuts";
import { ipc } from "../ipc/client";
import { useEditorStore } from "../state/editorStore";
import { useInteractionStore } from "../state/interactionStore";
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
  openDemoPack: () => Promise<void>;
}

export function useAppCommandBindings(
  projectSource: ProjectSourceApi,
  saveWorkflow: SaveWorkflowApi,
  onOpenSettings: () => void,
  onOpenExportScreenshot: () => void,
) {
  const appInfo = useProjectStore((s) => s.appInfo);
  const handle = useProjectStore((s) => s.handle);
  const setKindFilter = useProjectStore((s) => s.setKindFilter);
  const setNamespaceFilter = useProjectStore((s) => s.setNamespaceFilter);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setViewerLightingPreset = useSettingsStore((s) => s.setViewerLightingPreset);
  const viewerShowGrid = useSettingsStore((s) => s.viewerShowGrid);
  const setViewerShowGrid = useSettingsStore((s) => s.setViewerShowGrid);
  const viewerShowVignette = useSettingsStore((s) => s.viewerShowVignette);
  const setViewerShowVignette = useSettingsStore((s) => s.setViewerShowVignette);
  const toggleFocusMode = useSettingsStore((s) => s.toggleFocusMode);
  const clearRecentProjects = useSettingsStore((s) => s.clearRecentProjects);
  const setTool = useEditorStore((s) => s.setTool);
  const cycleComparator = useInteractionStore((s) => s.cycleComparator);
  const toggleInteractionMode = useSelectionStore((s) => s.toggleInteractionMode);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const setLightingPreset = useViewerStore((s) => s.setLightingPreset);
  const setShowGrid = useViewerStore((s) => s.setShowGrid);
  const setShowVignette = useViewerStore((s) => s.setShowVignette);
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const openShortcutsHelp = useUiStore((s) => s.openShortcutsHelp);
  const requestExplorerFocus = useUiStore((s) => s.requestExplorerFocus);
  const pushToast = useUiStore((s) => s.pushToast);

  const handleExportScreenshot = useCallback(
    (options?: ScreenshotExportOptions) => {
      const ok = exportViewerScreenshot(options);
      if (ok) {
        pushToast("Screenshot exported", "success");
      } else {
        pushToast("No 3D view to capture", "error");
      }
    },
    [pushToast],
  );

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
      onOpenDemoPack: () => void projectSource.openDemoPack(),
      onOpenPath: (path: string) => void projectSource.openSource(path),
      onSave: () => void saveWorkflow.handleSave(),
      onSaveAs: () => saveWorkflow.setSaveDialogOpen(true),
      onRestoreBackup: () => void saveWorkflow.handleRestoreBackup(),
      onOpenBackupManager: () => saveWorkflow.setBackupDialogOpen(true),
      onOpenSettings,
      onToggleComparator: () => {
        const current = useViewerStore.getState().currentRenderable;
        cycleComparator(current);
      },
      onSetCameraPreset: setCameraPreset,
      onSetLightingPreset: (preset: import("../lib/lightingPresets").LightingPreset) => {
        setViewerLightingPreset(preset);
        setLightingPreset(preset);
      },
      onToggleGrid: () => {
        const next = !viewerShowGrid;
        setViewerShowGrid(next);
        setShowGrid(next);
      },
      onToggleVignette: () => {
        const next = !viewerShowVignette;
        setViewerShowVignette(next);
        setShowVignette(next);
      },
      onToggleFocusMode: toggleFocusMode,
      onSetKindFilter: setKindFilter,
      onSetNamespaceFilter: setNamespaceFilter,
      onToggleTheme: toggleTheme,
      onSetTheme: setTheme,
      onTogglePaintMode: toggleInteractionMode,
      onSetTool: setTool,
      onFocusExplorer: requestExplorerFocus,
      onExportScreenshot: onOpenExportScreenshot,
      onExportShortcuts: downloadShortcutsExport,
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
      cycleComparator,
      setCameraPreset,
      setViewerLightingPreset,
      setLightingPreset,
      viewerShowGrid,
      setViewerShowGrid,
      setShowGrid,
      viewerShowVignette,
      setViewerShowVignette,
      setShowVignette,
      toggleFocusMode,
      setKindFilter,
      setNamespaceFilter,
      toggleTheme,
      setTheme,
      toggleInteractionMode,
      setTool,
      requestExplorerFocus,
      onOpenExportScreenshot,
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

  const commands = useAppCommands(commandHandlers);

  return { commands, handleExportScreenshot };
}
