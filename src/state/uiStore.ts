import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

const MAX_TOAST_MESSAGE_LENGTH = 300;
const TOAST_DURATION_MS = 4200;
const MAX_TOASTS = 4;

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface UiState {
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  explorerFocusTick: number;
  saveFlashTick: number;
  recentCommandIds: string[];
  toasts: Toast[];
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  openShortcutsHelp: () => void;
  closeShortcutsHelp: () => void;
  requestExplorerFocus: () => void;
  pushRecentCommand: (commandId: string) => void;
  triggerSaveFlash: () => void;
  /** Push a toast and return its id for programmatic early dismissal. */
  pushToast: (message: string, variant?: ToastVariant) => string;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useUiStore = create<UiState>((set, get) => ({
  commandPaletteOpen: false,
  shortcutsHelpOpen: false,
  explorerFocusTick: 0,
  saveFlashTick: 0,
  recentCommandIds: [],
  toasts: [],
  openCommandPalette: () => set({ commandPaletteOpen: true, shortcutsHelpOpen: false }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => {
    const open = get().commandPaletteOpen;
    set({ commandPaletteOpen: !open, shortcutsHelpOpen: false });
  },
  openShortcutsHelp: () => set({ shortcutsHelpOpen: true, commandPaletteOpen: false }),
  closeShortcutsHelp: () => set({ shortcutsHelpOpen: false }),
  requestExplorerFocus: () =>
    set((s) => ({ explorerFocusTick: s.explorerFocusTick + 1 })),
  pushRecentCommand: (commandId) =>
    set((s) => ({
      recentCommandIds: [
        commandId,
        ...s.recentCommandIds.filter((id) => id !== commandId),
      ].slice(0, 8),
    })),
  triggerSaveFlash: () => set((s) => ({ saveFlashTick: s.saveFlashTick + 1 })),
  pushToast: (message, variant = "info") => {
    const id = `toast-${++toastCounter}`;
    const truncated =
      message.length > MAX_TOAST_MESSAGE_LENGTH
        ? `${message.slice(0, MAX_TOAST_MESSAGE_LENGTH)}…`
        : message;

    set((s) => {
      const next = [...s.toasts, { id, message: truncated, variant }];
      if (next.length > MAX_TOASTS) {
        // Clear timers for evicted toasts before slicing.
        const evicted = next.slice(0, next.length - MAX_TOASTS);
        for (const t of evicted) {
          const timer = toastTimers.get(t.id);
          if (timer !== undefined) {
            clearTimeout(timer);
            toastTimers.delete(t.id);
          }
        }
      }
      return { toasts: next.slice(-MAX_TOASTS) };
    });

    const timer = setTimeout(() => {
      toastTimers.delete(id);
      get().dismissToast(id);
    }, TOAST_DURATION_MS);
    toastTimers.set(id, timer);

    return id;
  },
  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const timer of toastTimers.values()) {
      clearTimeout(timer);
    }
    toastTimers.clear();
  });
}
