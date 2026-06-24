import type { AppCommand } from "../commands/types";
import type { EditorTool } from "../state/editorStore";
import { TOOL_HOTKEYS } from "../state/editorStore";
import type { CameraPreset } from "../lib/cameraPresets";
import { CAMERA_PRESET_HOTKEYS } from "../lib/cameraPresets";
import { SHORTCUT_BY_ID } from "./shortcuts";

export type HotkeyBinding = {
  id: string;
  shortcut: string;
  when?: "always" | "app-enabled" | "palette-closed";
};

function binding(id: string, fallback: string): string {
  return SHORTCUT_BY_ID[id]?.binding ?? fallback;
}

export const HOTKEY_BINDINGS = {
  commandPalette: {
    id: "command-palette",
    shortcut: binding("command-palette", "ctrl+k"),
    when: "always",
  } as const,
  shortcutsHelp: {
    id: "shortcuts-help",
    shortcut: binding("shortcuts-help", "?"),
    when: "always",
  } as const,
  save: { id: "save", shortcut: binding("save", "ctrl+s"), when: "app-enabled" } as const,
  saveAs: {
    id: "save-as",
    shortcut: binding("save-as", "ctrl+shift+s"),
    when: "app-enabled",
  } as const,
  copy: { id: "copy", shortcut: binding("copy", "ctrl+c"), when: "app-enabled" } as const,
  paste: {
    id: "paste",
    shortcut: binding("paste", "ctrl+v"),
    when: "app-enabled",
  } as const,
  focusExplorer: {
    id: "focus-explorer",
    shortcut: binding("focus-explorer", "ctrl+f"),
    when: "app-enabled",
  } as const,
  toggleFocusMode: {
    id: "toggle-focus-mode",
    shortcut: binding("toggle-focus-mode", "ctrl+\\"),
    when: "app-enabled",
  } as const,
  togglePaintMode: {
    id: "toggle-paint",
    shortcut: binding("toggle-paint", "space"),
    when: "app-enabled",
  } as const,
  toggleComparator: {
    id: "toggle-comparator",
    shortcut: binding("toggle-comparator", "c"),
    when: "app-enabled",
  } as const,
  undo: { id: "undo", shortcut: binding("undo", "ctrl+z"), when: "app-enabled" } as const,
  redo: {
    id: "redo",
    shortcut: binding("redo", "ctrl+shift+z"),
    when: "app-enabled",
  } as const,
  redoAlt: { id: "redo-alt", shortcut: "ctrl+y", when: "app-enabled" } as const,
  rectFilledToggle: {
    id: "rect-filled",
    shortcut: binding("rect-filled", "shift+f"),
    when: "app-enabled",
  } as const,
  zoomIn: {
    id: "zoom-in",
    shortcut: binding("zoom-in", "+"),
    when: "app-enabled",
  } as const,
  zoomOut: {
    id: "zoom-out",
    shortcut: binding("zoom-out", "-"),
    when: "app-enabled",
  } as const,
  zoomReset: {
    id: "zoom-reset",
    shortcut: binding("zoom-reset", "0"),
    when: "app-enabled",
  } as const,
  nextFrame: {
    id: "next-frame",
    shortcut: binding("next-frame", "."),
    when: "app-enabled",
  } as const,
  prevFrame: {
    id: "prev-frame",
    shortcut: binding("prev-frame", ","),
    when: "app-enabled",
  } as const,
  pickerAlt: {
    id: "picker-alt",
    shortcut: binding("picker-alt", "alt+i"),
    when: "app-enabled",
  } as const,
} satisfies Record<string, HotkeyBinding>;

export function toolHotkeyBindings(): { tool: EditorTool; shortcut: string }[] {
  return (Object.entries(TOOL_HOTKEYS) as [EditorTool, string][])
    .filter(([, key]) => key.length > 0)
    .map(([tool, shortcut]) => ({ tool, shortcut: shortcut.toLowerCase() }));
}

export function cameraHotkeyBindings(): { preset: CameraPreset; shortcut: string }[] {
  return Object.entries(CAMERA_PRESET_HOTKEYS).map(([shortcut, preset]) => ({
    preset,
    shortcut,
  }));
}

export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needsCtrl = parts.includes("ctrl");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");
  const ctrl = event.ctrlKey || event.metaKey;

  if (needsCtrl !== ctrl) return false;
  if (needsShift !== event.shiftKey) return false;
  if (needsAlt !== event.altKey) return false;

  if (key === "space") return event.code === "Space";
  if (key === "?") return event.key === "?";
  if (key === "+") return event.key === "+" || event.key === "=";
  return event.key.toLowerCase() === key;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export type HotkeyHandlers = {
  onSave: () => void;
  onSaveAs?: () => void;
  onTogglePaintMode: () => void;
  onSetTool: (tool: EditorTool) => void;
  onFocusExplorer: () => void;
  onToggleFocusMode?: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onToggleComparator: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onNextFrame?: () => void;
  onPrevFrame?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleRectFilled?: () => void;
  commands: AppCommand[];
};
