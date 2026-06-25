import { useEffect, useRef } from "react";

import {
  cameraHotkeyBindings,
  HOTKEY_BINDINGS,
  isTypingTarget,
  matchShortcut,
  toolHotkeyBindings,
  type HotkeyHandlers,
} from "../lib/hotkeyRegistry";
import { useUiStore } from "../state/uiStore";

export type { HotkeyHandlers } from "../lib/hotkeyRegistry";

export function useHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const openShortcutsHelp = useUiStore((s) => s.openShortcutsHelp);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const shortcutsHelpOpen = useUiStore((s) => s.shortcutsHelpOpen);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const handlers = handlersRef.current;
      if (commandPaletteOpen || shortcutsHelpOpen) {
        if (event.key === "Escape") {
          useUiStore.getState().closeCommandPalette();
          useUiStore.getState().closeShortcutsHelp();
        }
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.commandPalette.shortcut)) {
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

      if (matchShortcut(event, HOTKEY_BINDINGS.saveAs.shortcut)) {
        event.preventDefault();
        handlers.onSaveAs?.();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.copy.shortcut) && handlers.onCopy) {
        event.preventDefault();
        handlers.onCopy();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.paste.shortcut) && handlers.onPaste) {
        event.preventDefault();
        handlers.onPaste();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.save.shortcut)) {
        event.preventDefault();
        handlers.onSave();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.undo.shortcut) && handlers.onUndo) {
        event.preventDefault();
        handlers.onUndo();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.redo.shortcut) && handlers.onRedo) {
        event.preventDefault();
        handlers.onRedo();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.redoAlt.shortcut) && handlers.onRedo) {
        event.preventDefault();
        handlers.onRedo();
        return;
      }

      if (
        matchShortcut(event, HOTKEY_BINDINGS.rectFilledToggle.shortcut) &&
        handlers.onToggleRectFilled
      ) {
        event.preventDefault();
        handlers.onToggleRectFilled();
        return;
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.focusExplorer.shortcut)) {
        event.preventDefault();
        handlers.onFocusExplorer();
        return;
      }

      if (
        matchShortcut(event, HOTKEY_BINDINGS.toggleFocusMode.shortcut) &&
        handlers.onToggleFocusMode
      ) {
        event.preventDefault();
        handlers.onToggleFocusMode();
        return;
      }

      if (
        matchShortcut(event, HOTKEY_BINDINGS.togglePaintMode.shortcut) &&
        !event.repeat
      ) {
        event.preventDefault();
        handlers.onTogglePaintMode();
        return;
      }

      for (const { preset, shortcut } of cameraHotkeyBindings()) {
        if (
          event.key === shortcut &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          handlers.onSetCameraPreset(preset);
          return;
        }
      }

      if (
        matchShortcut(event, HOTKEY_BINDINGS.toggleComparator.shortcut) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        handlers.onToggleComparator();
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (matchShortcut(event, HOTKEY_BINDINGS.zoomIn.shortcut)) {
          event.preventDefault();
          handlers.onZoomIn?.();
          return;
        }
        if (matchShortcut(event, HOTKEY_BINDINGS.zoomOut.shortcut)) {
          event.preventDefault();
          handlers.onZoomOut?.();
          return;
        }
        if (matchShortcut(event, HOTKEY_BINDINGS.zoomReset.shortcut)) {
          event.preventDefault();
          handlers.onZoomReset?.();
          return;
        }
        if (matchShortcut(event, HOTKEY_BINDINGS.nextFrame.shortcut)) {
          event.preventDefault();
          handlers.onNextFrame?.();
          return;
        }
        if (matchShortcut(event, HOTKEY_BINDINGS.prevFrame.shortcut)) {
          event.preventDefault();
          handlers.onPrevFrame?.();
          return;
        }
      }

      if (matchShortcut(event, HOTKEY_BINDINGS.pickerAlt.shortcut)) {
        event.preventDefault();
        handlers.onSetTool("picker");
        return;
      }

      for (const { tool, shortcut } of toolHotkeyBindings()) {
        if (
          event.key.toUpperCase() === shortcut.toUpperCase() &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          handlers.onSetTool(tool);
          return;
        }
      }

      for (const command of handlers.commands) {
        if (!command.shortcut || command.disabled) continue;
        if (matchShortcut(event, command.shortcut)) {
          event.preventDefault();
          const result = command.run();
          if (result instanceof Promise) {
            result.catch((err: unknown) => {
              console.error(`[hotkey] command "${command.id}" failed:`, err);
            });
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    toggleCommandPalette,
    openShortcutsHelp,
    commandPaletteOpen,
    shortcutsHelpOpen,
  ]);
}
