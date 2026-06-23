import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface UiState {
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  explorerFocusTick: number;
  toasts: Toast[];
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  openShortcutsHelp: () => void;
  closeShortcutsHelp: () => void;
  requestExplorerFocus: () => void;
  pushToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set, get) => ({
  commandPaletteOpen: false,
  shortcutsHelpOpen: false,
  explorerFocusTick: 0,
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
  pushToast: (message, variant = "info") => {
    const id = `toast-${++toastCounter}`;
    set((s) => ({
      toasts: [...s.toasts, { id, message, variant }].slice(-4),
    }));
    window.setTimeout(() => {
      get().dismissToast(id);
    }, 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
