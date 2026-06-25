import { create } from "zustand";

import type { RenderFace } from "../ipc/types";

export type InteractionMode = "orbit" | "paint";

export interface SelectedFace {
  cuboidIndex: number;
  faceIndex: number;
  direction: string;
  texturePath: string;
  uv: [number, number, number, number];
  rotation: number;
  tintindex: number;
  hitUv: [number, number];
  pixel: [number, number];
}

export interface FacePickData {
  cuboidIndex: number;
  faceIndex: number;
  face: RenderFace;
}

export interface HoveredFace {
  cuboidIndex: number;
  faceIndex: number;
}

export const FACE_PICK_KEY = "facePick";

interface SelectionState {
  selectedFace: SelectedFace | null;
  hoveredFace: HoveredFace | null;
  interactionMode: InteractionMode;
  setSelectedFace: (face: SelectedFace | null) => void;
  setHoveredFace: (face: HoveredFace | null) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  toggleInteractionMode: () => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedFace: null,
  hoveredFace: null,
  interactionMode: "orbit",
  setSelectedFace: (selectedFace) => set({ selectedFace }),
  setHoveredFace: (hoveredFace) => set({ hoveredFace }),
  setInteractionMode: (interactionMode) => set({ interactionMode }),
  toggleInteractionMode: () =>
    set({
      interactionMode: get().interactionMode === "orbit" ? "paint" : "orbit",
    }),
  clearSelection: () =>
    set({ selectedFace: null, hoveredFace: null, interactionMode: "orbit" }),
}));
