import type { EditorTool } from "../state/editorStore";
import { TOOL_HOTKEYS, TOOL_LABELS } from "../state/editorStore";
import type { CameraPreset } from "./cameraPresets";
import { CAMERA_PRESETS } from "./cameraPresets";

export type ShortcutCategory = "general" | "viewer" | "editor" | "layout" | "navigation";

export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  category: ShortcutCategory;
  /** Normalized binding, e.g. `ctrl+k`, `b`, `1` */
  binding: string;
  keywords?: string;
}

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  viewer: "Viewer",
  editor: "Editor",
  layout: "Layout",
  navigation: "Navigation",
};

const EDITOR_TOOL_ORDER: EditorTool[] = [
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

function toolShortcuts(): ShortcutDefinition[] {
  return EDITOR_TOOL_ORDER.map((tool) => ({
    id: `tool-${tool}`,
    label: TOOL_LABELS[tool],
    description: `${TOOL_LABELS[tool]} tool`,
    category: "editor" as const,
    binding: TOOL_HOTKEYS[tool].toLowerCase(),
    keywords: tool,
  }));
}

function cameraShortcuts(): ShortcutDefinition[] {
  return CAMERA_PRESETS.map((preset) => ({
    id: `camera-${preset.id}`,
    label: `${preset.label} camera`,
    description: `Set camera to ${preset.label}`,
    category: "viewer" as const,
    binding: preset.hotkey,
    keywords: `camera ${preset.id}`,
  }));
}

/** Single source of truth for shortcuts across help, palette, and hotkey registry. */
export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "command-palette",
    label: "Command palette",
    description: "Open command palette",
    category: "general",
    binding: "ctrl+k",
    keywords: "commands search",
  },
  {
    id: "shortcuts-help",
    label: "Keyboard shortcuts",
    description: "Show keyboard shortcuts",
    category: "general",
    binding: "?",
  },
  {
    id: "save",
    label: "Save",
    description: "Save textures",
    category: "general",
    binding: "ctrl+s",
  },
  {
    id: "save-as",
    label: "Save As",
    description: "Save textures as…",
    category: "general",
    binding: "ctrl+shift+s",
  },
  {
    id: "undo",
    label: "Undo",
    description: "Undo last edit",
    category: "editor",
    binding: "ctrl+z",
  },
  {
    id: "redo",
    label: "Redo",
    description: "Redo",
    category: "editor",
    binding: "ctrl+shift+z",
    keywords: "ctrl+y",
  },
  {
    id: "copy",
    label: "Copy region",
    description: "Copy texture region",
    category: "editor",
    binding: "ctrl+c",
  },
  {
    id: "paste",
    label: "Paste region",
    description: "Paste texture region",
    category: "editor",
    binding: "ctrl+v",
  },
  {
    id: "picker-alt",
    label: "Picker (alternate)",
    description: "Colour picker",
    category: "editor",
    binding: "alt+i",
  },
  {
    id: "rect-filled",
    label: "Toggle filled rectangle",
    description: "Filled vs outline rectangle",
    category: "editor",
    binding: "shift+f",
  },
  {
    id: "zoom-in",
    label: "Zoom in",
    description: "Editor zoom in",
    category: "editor",
    binding: "+",
  },
  {
    id: "zoom-out",
    label: "Zoom out",
    description: "Editor zoom out",
    category: "editor",
    binding: "-",
  },
  {
    id: "zoom-reset",
    label: "Reset zoom",
    description: "Reset editor zoom",
    category: "editor",
    binding: "0",
  },
  {
    id: "next-frame",
    label: "Next animation frame",
    description: "Next frame",
    category: "editor",
    binding: ".",
  },
  {
    id: "prev-frame",
    label: "Previous animation frame",
    description: "Previous frame",
    category: "editor",
    binding: ",",
  },
  ...toolShortcuts(),
  {
    id: "toggle-paint",
    label: "Toggle Orbit / Paint",
    description: "Switch viewer interaction mode",
    category: "viewer",
    binding: "space",
  },
  {
    id: "toggle-comparator",
    label: "Cycle compare",
    description: "Compare off → 2D → 3D",
    category: "viewer",
    binding: "c",
  },
  ...cameraShortcuts(),
  {
    id: "camera-free",
    label: "Free camera",
    description: "Free orbit camera",
    category: "viewer",
    binding: "5",
    keywords: "camera free",
  },
  {
    id: "focus-explorer",
    label: "Focus explorer",
    description: "Focus explorer search",
    category: "navigation",
    binding: "ctrl+f",
  },
  {
    id: "toggle-focus-mode",
    label: "Focus mode",
    description: "Hide explorer — viewer + editor only",
    category: "layout",
    binding: "ctrl+\\",
  },
];

export const SHORTCUT_BY_ID = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((def) => [def.id, def]),
) as Record<string, ShortcutDefinition>;

export function shortcutsByCategory(): Record<ShortcutCategory, ShortcutDefinition[]> {
  const grouped: Record<ShortcutCategory, ShortcutDefinition[]> = {
    general: [],
    viewer: [],
    editor: [],
    layout: [],
    navigation: [],
  };
  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.binding) grouped[def.category].push(def);
  }
  return grouped;
}

/** Human-readable shortcut for UI chips (Ctrl+K, B, …). */
export function formatShortcutDisplay(binding: string): string {
  if (!binding) return "";
  return binding
    .split("+")
    .map((part) => {
      if (part === "ctrl") return "Ctrl";
      if (part === "shift") return "Shift";
      if (part === "alt") return "Alt";
      if (part === "space") return "Space";
      if (part === "\\") return "\\";
      if (part.length === 1) return part.toUpperCase();
      return part;
    })
    .join("+");
}

export function shortcutForTool(tool: EditorTool): string | undefined {
  const binding = TOOL_HOTKEYS[tool];
  return binding ? formatShortcutDisplay(binding.toLowerCase()) : undefined;
}

export function shortcutForCamera(preset: CameraPreset): string | undefined {
  const def = SHORTCUT_DEFINITIONS.find((s) => s.id === `camera-${preset}`);
  return def?.binding ? formatShortcutDisplay(def.binding) : undefined;
}

export interface ShortcutExportPayload {
  version: 1;
  exportedAt: string;
  readOnly: true;
  bindings: Array<{
    id: string;
    label: string;
    binding: string;
    category: ShortcutCategory;
  }>;
}

export function exportShortcutsJson(): string {
  const payload: ShortcutExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    readOnly: true,
    bindings: SHORTCUT_DEFINITIONS.filter((s) => s.binding).map((s) => ({
      id: s.id,
      label: s.label,
      binding: s.binding,
      category: s.category,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadShortcutsExport(): void {
  const blob = new Blob([exportShortcutsJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ind3x-shortcuts.json";
  link.click();
  URL.revokeObjectURL(url);
}
