import { useMemo } from "react";

import type { AppCommand } from "./types";
import { TOOL_HOTKEYS, TOOL_LABELS, type EditorTool } from "../state/editorStore";
import { useSettingsStore } from "../state/settingsStore";

import type { CameraPreset } from "../state/viewerStore";

export interface AppCommandHandlers {
  onOpenJar: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onRestoreBackup: () => void | Promise<void>;
  onOpenBackupManager?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme: () => void;
  onTogglePaintMode: () => void;
  onSetTool: (tool: EditorTool) => void;
  onFocusExplorer: () => void;
  onExportScreenshot: () => void;
  onShowShortcuts: () => void;
  onOpenCommandPalette: () => void;
  onClearRecent: () => void;
  onOpenLogs: () => void | Promise<void>;
  onAbout: () => void | Promise<void>;
  onToggleComparator: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  canSave: boolean;
  hasProject: boolean;
}

export function useAppCommands(handlers: AppCommandHandlers): AppCommand[] {
  const recentProjects = useSettingsStore((s) => s.recentProjects);

  return useMemo(() => {
    const tools: EditorTool[] = ["pencil", "eraser", "fill", "picker"];
    const toolCommands: AppCommand[] = tools.map((tool) => ({
      id: `tool-${tool}`,
      label: `${TOOL_LABELS[tool]} tool`,
      group: "editor",
      shortcut: TOOL_HOTKEYS[tool],
      keywords: tool,
      run: () => handlers.onSetTool(tool),
    }));

    const recentCommands: AppCommand[] = recentProjects.map((project) => ({
      id: `recent-${project.path}`,
      label: project.path.split(/[/\\]/).pop() ?? project.path,
      group: "recent",
      keywords: `${project.path} ${project.kind}`,
      run: () => handlers.onOpenPath(project.path),
    }));

    const commands: AppCommand[] = [
      {
        id: "open-jar",
        label: "Open JAR / ZIP",
        group: "file",
        keywords: "mod archive",
        run: handlers.onOpenJar,
      },
      {
        id: "open-folder",
        label: "Open resource folder",
        group: "file",
        keywords: "directory pack",
        run: handlers.onOpenFolder,
      },
      {
        id: "save",
        label: "Save textures",
        group: "file",
        shortcut: "Ctrl+S",
        disabled: !handlers.canSave,
        run: handlers.onSave,
      },
      {
        id: "save-as",
        label: "Save textures as…",
        group: "file",
        keywords: "export namespace rename folder",
        disabled: !handlers.canSave,
        run: handlers.onSaveAs,
      },
      {
        id: "restore-backup",
        label: "Restore last backup",
        group: "file",
        keywords: "undo rollback",
        disabled: !handlers.hasProject,
        run: handlers.onRestoreBackup,
      },
      {
        id: "backup-manager",
        label: "Open Backup Manager…",
        group: "file",
        keywords: "history journal backups",
        disabled: !handlers.hasProject,
        run: () => handlers.onOpenBackupManager?.(),
      },
      {
        id: "open-settings",
        label: "Settings…",
        group: "view",
        keywords: "preferences theme cache scale",
        run: () => handlers.onOpenSettings?.(),
      },
      {
        id: "toggle-comparator",
        label: "Toggle before / after comparator",
        group: "view",
        shortcut: "C",
        disabled: !handlers.hasProject,
        run: handlers.onToggleComparator,
      },
      {
        id: "toggle-theme",
        label: "Toggle light / dark theme",
        group: "view",
        run: handlers.onToggleTheme,
      },
      {
        id: "toggle-paint",
        label: "Toggle Orbit / Paint mode",
        group: "view",
        shortcut: "Space",
        disabled: !handlers.hasProject,
        run: handlers.onTogglePaintMode,
      },
      ...toolCommands,
      {
        id: "focus-explorer",
        label: "Focus explorer search",
        group: "navigation",
        shortcut: "Ctrl+F",
        disabled: !handlers.hasProject,
        run: handlers.onFocusExplorer,
      },
      {
        id: "export-screenshot",
        label: "Export 3D screenshot",
        group: "export",
        disabled: !handlers.hasProject,
        run: handlers.onExportScreenshot,
      },
      {
        id: "open-logs",
        label: "Open log folder",
        group: "help",
        keywords: "debug diagnostics",
        run: handlers.onOpenLogs,
      },
      {
        id: "about",
        label: "About inD3X Art",
        group: "help",
        keywords: "version info",
        run: handlers.onAbout,
      },
      {
        id: "show-shortcuts",
        label: "Show keyboard shortcuts",
        group: "help",
        shortcut: "?",
        run: handlers.onShowShortcuts,
      },
      {
        id: "command-palette",
        label: "Open command palette",
        group: "help",
        shortcut: "Ctrl+K",
        run: handlers.onOpenCommandPalette,
      },
      ...recentCommands,
    ];

    if (recentProjects.length > 0) {
      commands.push({
        id: "clear-recent",
        label: "Clear recent projects",
        group: "recent",
        run: handlers.onClearRecent,
      });
    }

    return commands;
  }, [handlers, recentProjects]);
}
