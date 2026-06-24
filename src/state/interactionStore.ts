import { create } from "zustand";

import type { RenderableModel } from "../ipc/types";
import type { ComparatorMode } from "../lib/cameraPresets";
import { cloneRenderable } from "../lib/cloneRenderable";
import { useViewerStore } from "./viewerStore";

interface InteractionState {
  comparatorMode: ComparatorMode;
  viewerBeforeModel: RenderableModel | null;
  setComparatorMode: (mode: ComparatorMode) => void;
  /** Cycle comparator: off → 2D split → 3D split → off */
  cycleComparator: (captureFor3d?: RenderableModel | null) => void;
  captureCompareBefore: (model: RenderableModel) => void;
  captureCompareBeforeFromSave: () => void;
  setViewerBeforeModel: (model: RenderableModel | null) => void;
  resetInteractionState: () => void;
  /** @deprecated Use cycleComparator */
  toggleComparator2d: () => void;
  /** @deprecated Use cycleComparator */
  toggleComparator3d: (capture?: RenderableModel | null) => void;
}

export const useInteractionStore = create<InteractionState>((set, get) => ({
  comparatorMode: null,
  viewerBeforeModel: null,
  setComparatorMode: (comparatorMode) => set({ comparatorMode }),
  cycleComparator: (captureFor3d) => {
    const { comparatorMode, viewerBeforeModel } = get();
    if (comparatorMode === null) {
      set({ comparatorMode: "2d" });
      return;
    }
    if (comparatorMode === "2d") {
      const before =
        viewerBeforeModel ?? (captureFor3d ? cloneRenderable(captureFor3d) : null);
      // Do not enter 3D mode without a before-model — silent broken state.
      if (!before) return;
      set({ comparatorMode: "3d", viewerBeforeModel: before });
      return;
    }
    // Exiting comparator: release the held model to free memory.
    set({ comparatorMode: null, viewerBeforeModel: null });
  },
  captureCompareBefore: (model) => set({ viewerBeforeModel: cloneRenderable(model) }),
  captureCompareBeforeFromSave: () => {
    const current = useViewerStore.getState().currentRenderable;
    if (current) {
      set({ viewerBeforeModel: cloneRenderable(current) });
    }
  },
  setViewerBeforeModel: (viewerBeforeModel) => set({ viewerBeforeModel }),
  resetInteractionState: () => set({ comparatorMode: null, viewerBeforeModel: null }),
  toggleComparator2d: () => get().cycleComparator(),
  toggleComparator3d: (capture) => {
    const mode = get().comparatorMode;
    if (mode === "3d") {
      set({ comparatorMode: null, viewerBeforeModel: null });
      return;
    }
    const before = get().viewerBeforeModel ?? (capture ? cloneRenderable(capture) : null);
    if (!before) return;
    set({ comparatorMode: "3d", viewerBeforeModel: before });
  },
}));
