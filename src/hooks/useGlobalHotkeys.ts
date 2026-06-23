import { useEffect } from "react";

import type { AppCommand } from "../commands/types";
import { TOOL_HOTKEYS, type EditorTool } from "../state/editorStore";
import type { CameraPreset } from "../state/viewerStore";
import { CAMERA_PRESET_HOTKEYS } from "../state/viewerStore";
import { useUiStore } from "../state/uiStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needsCtrl = parts.includes("ctrl");
  const needsShift = parts.includes("shift");
  const ctrl = event.ctrlKey || event.metaKey;

  if (needsCtrl !== ctrl) return false;
  if (needsShift !== event.shiftKey) return false;

  if (key === "space") return event.code === "Space";
  if (key === "?") return event.key === "?";
  return event.key.toLowerCase() === key;
}

interface GlobalHotkeyHandlers {
  onSave: () => void;
  onSaveAs?: () => void;
  onTogglePaintMode: () => void;
  onSetTool: (tool: EditorTool) => void;
  onFocusExplorer: () => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onToggleComparator: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onNextFrame?: () => void;
  onPrevFrame?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  commands: AppCommand[];
}

export function useGlobalHotkeys(handlers: GlobalHotkeyHandlers, enabled: boolean): void {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const openShortcutsHelp = useUiStore((s) => s.openShortcutsHelp);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const shortcutsHelpOpen = useUiStore((s) => s.shortcutsHelpOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (commandPaletteOpen || shortcutsHelpOpen) {
        if (event.key === "Escape") {
          useUiStore.getState().closeCommandPalette();
          useUiStore.getState().closeShortcutsHelp();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleCommandPalette();
        return;
      }

      if (event.key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        openShortcutsHelp();
        return;
      }

      if (!enabled) return;

      if (isTypingTarget(event.target)) return;

      if (matchShortcut(event, "ctrl+shift+s")) {
        event.preventDefault();
        handlers.onSaveAs?.();
        return;
      }

      if (matchShortcut(event, "ctrl+c") && handlers.onCopy) {
        event.preventDefault();
        handlers.onCopy();
        return;
      }

      if (matchShortcut(event, "ctrl+v") && handlers.onPaste) {
        event.preventDefault();
        handlers.onPaste();
        return;
      }

      if (matchShortcut(event, "ctrl+s")) {
        event.preventDefault();
        handlers.onSave();
        return;
      }

      if (matchShortcut(event, "ctrl+f")) {
        event.preventDefault();
        handlers.onFocusExplorer();
        return;
      }

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        handlers.onTogglePaintMode();
        return;
      }

      const cameraPreset = CAMERA_PRESET_HOTKEYS[event.key];
      if (cameraPreset && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        handlers.onSetCameraPreset(cameraPreset);
        return;
      }

      if (
        event.key.toLowerCase() === "c" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        handlers.onToggleComparator();
        return;
      }

      // Zoom: + / - / 0
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          handlers.onZoomIn?.();
          return;
        }
        if (event.key === "-") {
          event.preventDefault();
          handlers.onZoomOut?.();
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          handlers.onZoomReset?.();
          return;
        }
        if (event.key === ".") {
          event.preventDefault();
          handlers.onNextFrame?.();
          return;
        }
        if (event.key === ",") {
          event.preventDefault();
          handlers.onPrevFrame?.();
          return;
        }
      }

      // Alt+I → picker tool
      if (event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        handlers.onSetTool("picker");
        return;
      }

      const toolEntries = Object.entries(TOOL_HOTKEYS) as [EditorTool, string][];
      for (const [tool, hotkey] of toolEntries) {
        if (event.key.toUpperCase() === hotkey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          handlers.onSetTool(tool);
          return;
        }
      }

      for (const command of handlers.commands) {
        if (!command.shortcut || command.disabled) continue;
        if (matchShortcut(event, command.shortcut)) {
          event.preventDefault();
          void command.run();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    handlers,
    toggleCommandPalette,
    openShortcutsHelp,
    commandPaletteOpen,
    shortcutsHelpOpen,
  ]);
}
