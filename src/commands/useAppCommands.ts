import { useMemo } from "react";
import {
  Camera,
  Contrast,
  Filter,
  Focus,
  Image,
  Moon,
  Package,
  Sun,
  SunMoon,
} from "lucide-react";

import { CAMERA_PRESETS } from "../lib/cameraPresets";
import { LIGHTING_PRESET_LABELS, type LightingPreset } from "../lib/lightingPresets";
import { formatShortcutDisplay, SHORTCUT_BY_ID } from "../lib/shortcuts";
import { ASSET_KIND_LABELS, type AssetKind } from "../ipc/types";
import { TOOL_HOTKEYS, TOOL_LABELS, type EditorTool } from "../state/editorStore";
import { useSettingsStore, type Theme } from "../state/settingsStore";

import type { AppCommand } from "./types";
import type { CameraPreset } from "../lib/cameraPresets";

const ALL_TOOLS: EditorTool[] = [
  "pencil",
  "eraser",
  "fill",
  "picker",
  "wand",
  "line",
  "rect",
  "ellipse",
  "select",
  "move",
  "lighten",
  "darken",
  "dither",
];

const EXPLORER_KINDS: AssetKind[] = [
  "texture",
  "blockModel",
  "itemModel",
  "blockstate",
  "textureMeta",
  "other",
];

export interface AppCommandHandlers {
  onOpenJar: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onOpenDemoPack: () => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  onRestoreBackup: () => void | Promise<void>;
  onOpenBackupManager?: () => void;
  onOpenSettings?: () => void;
  onToggleTheme: () => void;
  onSetTheme?: (theme: Theme) => void;
  onTogglePaintMode: () => void;
  onSetTool: (tool: EditorTool) => void;
  onFocusExplorer: () => void;
  onToggleFocusMode?: () => void;
  onExportScreenshot: () => void;
  onShowShortcuts: () => void;
  onOpenCommandPalette: () => void;
  onClearRecent: () => void;
  onOpenLogs: () => void | Promise<void>;
  onAbout: () => void | Promise<void>;
  onToggleComparator: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onSetLightingPreset?: (preset: LightingPreset) => void;
  onToggleGrid?: () => void;
  onToggleVignette?: () => void;
  onSetKindFilter?: (kind: AssetKind | "all") => void;
  onSetNamespaceFilter?: (namespace: string) => void;
  onExportShortcuts?: () => void;
  canSave: boolean;
  hasProject: boolean;
}

function sc(id: string, fallback = ""): string | undefined {
  const binding = SHORTCUT_BY_ID[id]?.binding ?? fallback;
  return binding ? formatShortcutDisplay(binding) : undefined;
}

export function useAppCommands(handlers: AppCommandHandlers): AppCommand[] {
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const theme = useSettingsStore((s) => s.theme);

  return useMemo(() => {
    const toolCommands: AppCommand[] = ALL_TOOLS.map((tool) => ({
      id: `tool-${tool}`,
      label: `${TOOL_LABELS[tool]} tool`,
      group: "editor",
      shortcut: TOOL_HOTKEYS[tool]
        ? formatShortcutDisplay(TOOL_HOTKEYS[tool].toLowerCase())
        : undefined,
      keywords: `${tool} brush draw`,
      run: () => handlers.onSetTool(tool),
    }));

    const cameraCommands: AppCommand[] = [
      ...CAMERA_PRESETS.map(
        (preset): AppCommand => ({
          id: `camera-${preset.id}`,
          label: `${preset.label} camera`,
          group: "view",
          shortcut: formatShortcutDisplay(preset.hotkey),
          keywords: `camera ${preset.id} viewer`,
          icon: Camera,
          disabled: !handlers.hasProject,
          run: () => handlers.onSetCameraPreset(preset.id),
        }),
      ),
      {
        id: "camera-free",
        label: "Free camera",
        group: "view",
        shortcut: sc("camera-free", "5"),
        keywords: "camera orbit viewer",
        icon: Camera,
        disabled: !handlers.hasProject,
        run: () => handlers.onSetCameraPreset("free"),
      },
    ];

    const viewerCommands: AppCommand[] = [
      {
        id: "toggle-comparator",
        label: "Cycle compare: off → 2D → 3D",
        group: "view",
        shortcut: sc("toggle-comparator", "C"),
        disabled: !handlers.hasProject,
        run: handlers.onToggleComparator,
      },
      {
        id: "toggle-paint",
        label: "Toggle Orbit / Paint mode",
        group: "view",
        shortcut: sc("toggle-paint", "Space"),
        disabled: !handlers.hasProject,
        run: handlers.onTogglePaintMode,
      },
      ...(handlers.onSetLightingPreset
        ? (Object.keys(LIGHTING_PRESET_LABELS) as LightingPreset[]).map(
            (preset): AppCommand => ({
              id: `lighting-${preset}`,
              label: `Lighting: ${LIGHTING_PRESET_LABELS[preset]}`,
              group: "view",
              keywords: `lighting ${preset} viewer`,
              disabled: !handlers.hasProject,
              run: () => handlers.onSetLightingPreset!(preset),
            }),
          )
        : []),
      ...(handlers.onToggleGrid
        ? ([
            {
              id: "toggle-grid",
              label: "Toggle viewer grid",
              group: "view",
              keywords: "grid viewer",
              disabled: !handlers.hasProject,
              run: handlers.onToggleGrid,
            },
          ] satisfies AppCommand[])
        : []),
      ...(handlers.onToggleVignette
        ? ([
            {
              id: "toggle-vignette",
              label: "Toggle viewer vignette",
              group: "view",
              keywords: "vignette viewer",
              disabled: !handlers.hasProject,
              run: handlers.onToggleVignette,
            },
          ] satisfies AppCommand[])
        : []),
      ...(handlers.onToggleFocusMode
        ? ([
            {
              id: "toggle-focus-mode",
              label: "Toggle focus mode",
              group: "view",
              shortcut: sc("toggle-focus-mode", "Ctrl+\\"),
              keywords: "layout panels explorer hide",
              icon: Focus,
              run: handlers.onToggleFocusMode,
            },
          ] satisfies AppCommand[])
        : []),
    ];

    const explorerCommands: AppCommand[] = handlers.onSetKindFilter
      ? [
          {
            id: "filter-all",
            label: "Filter: all asset kinds",
            group: "navigation",
            keywords: "explorer filter kind",
            icon: Filter,
            disabled: !handlers.hasProject,
            run: () => handlers.onSetKindFilter!("all"),
          },
          ...EXPLORER_KINDS.map((kind) => ({
            id: `filter-kind-${kind}`,
            label: `Filter: ${ASSET_KIND_LABELS[kind]}`,
            group: "navigation" as const,
            keywords: `explorer filter ${kind}`,
            icon: Filter,
            disabled: !handlers.hasProject,
            run: () => handlers.onSetKindFilter!(kind),
          })),
          ...(handlers.onSetNamespaceFilter
            ? [
                {
                  id: "filter-namespace-minecraft",
                  label: "Filter namespace: minecraft",
                  group: "navigation" as const,
                  keywords: "explorer namespace",
                  icon: Filter,
                  disabled: !handlers.hasProject,
                  run: () => handlers.onSetNamespaceFilter!("minecraft"),
                },
                {
                  id: "filter-namespace-clear",
                  label: "Clear namespace filter",
                  group: "navigation" as const,
                  keywords: "explorer namespace clear",
                  icon: Filter,
                  disabled: !handlers.hasProject,
                  run: () => handlers.onSetNamespaceFilter!(""),
                },
              ]
            : []),
        ]
      : [];

    const settingsCommands: AppCommand[] = [
      {
        id: "settings-open",
        label: "Open Settings",
        group: "settings",
        settingsQuery: true,
        keywords: "preferences options",
        run: () => handlers.onOpenSettings?.(),
      },
      {
        id: "settings-theme-dark",
        label: "Theme: Dark",
        group: "settings",
        settingsQuery: true,
        icon: Moon,
        run: () => handlers.onSetTheme?.("dark"),
      },
      {
        id: "settings-theme-light",
        label: "Theme: Light",
        group: "settings",
        settingsQuery: true,
        icon: Sun,
        run: () => handlers.onSetTheme?.("light"),
      },
      {
        id: "settings-theme-hc",
        label: "Theme: High contrast",
        group: "settings",
        settingsQuery: true,
        icon: Contrast,
        run: () => handlers.onSetTheme?.("high-contrast"),
      },
      {
        id: "settings-cycle-theme",
        label: `Cycle theme (current: ${theme})`,
        group: "settings",
        settingsQuery: true,
        icon: SunMoon,
        run: handlers.onToggleTheme,
      },
      ...(handlers.onExportShortcuts
        ? [
            {
              id: "settings-export-shortcuts",
              label: "Export keyboard shortcuts JSON",
              group: "settings" as const,
              settingsQuery: true,
              keywords: "bindings hotkeys export json",
              run: handlers.onExportShortcuts,
            },
          ]
        : []),
    ];

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
        id: "open-demo-pack",
        label: "Try demo pack",
        group: "file",
        keywords: "sample tutorial onboarding demo",
        icon: Package,
        run: handlers.onOpenDemoPack,
      },
      {
        id: "save",
        label: "Save textures",
        group: "file",
        shortcut: sc("save", "Ctrl+S"),
        disabled: !handlers.canSave,
        run: handlers.onSave,
      },
      {
        id: "save-as",
        label: "Save textures as…",
        group: "file",
        shortcut: sc("save-as", "Ctrl+Shift+S"),
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
      ...viewerCommands,
      ...cameraCommands,
      ...toolCommands,
      ...explorerCommands,
      {
        id: "focus-explorer",
        label: "Focus explorer search",
        group: "navigation",
        shortcut: sc("focus-explorer", "Ctrl+F"),
        disabled: !handlers.hasProject,
        run: handlers.onFocusExplorer,
      },
      {
        id: "export-screenshot",
        label: "Export 3D screenshot…",
        group: "export",
        icon: Image,
        disabled: !handlers.hasProject,
        run: handlers.onExportScreenshot,
      },
      ...settingsCommands,
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
        shortcut: sc("shortcuts-help", "?"),
        run: handlers.onShowShortcuts,
      },
      {
        id: "command-palette",
        label: "Open command palette",
        group: "help",
        shortcut: sc("command-palette", "Ctrl+K"),
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
  }, [handlers, recentProjects, theme]);
}
