import { create } from "zustand";

import type { TextureMetaInfo } from "../ipc/types";

export type CameraPreset = "free" | "front" | "iso" | "top" | "inventory";

export type DisplaySlot =
  | "gui"
  | "fixed"
  | "thirdperson_righthand"
  | "thirdperson_lefthand"
  | "firstperson_righthand"
  | "firstperson_lefthand"
  | "head"
  | "ground";

interface ViewerState {
  cameraPreset: CameraPreset;
  cameraPresetTick: number;
  fps: number;
  displaySlot: DisplaySlot;
  /** TextureMeta for the currently rendered model (by texture path) */
  activeTextureMeta: Record<string, TextureMetaInfo>;
  /** VRAM texture/geometry object counts from renderer.info.memory */
  vramTextures: number;
  vramGeometries: number;
  setCameraPreset: (preset: CameraPreset) => void;
  setFps: (fps: number) => void;
  setDisplaySlot: (slot: DisplaySlot) => void;
  setActiveTextureMeta: (meta: Record<string, TextureMetaInfo>) => void;
  setVram: (textures: number, geometries: number) => void;
}

export const CAMERA_PRESET_HOTKEYS: Record<string, CameraPreset> = {
  "1": "iso",
  "2": "front",
  "3": "top",
  "4": "inventory",
  "5": "free",
};

export const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  free: "Free",
  front: "Front",
  iso: "Iso",
  top: "Top",
  inventory: "GUI",
};

export const useViewerStore = create<ViewerState>((set) => ({
  cameraPreset: "free",
  cameraPresetTick: 0,
  fps: 0,
  displaySlot: "gui",
  activeTextureMeta: {},
  vramTextures: 0,
  vramGeometries: 0,
  setCameraPreset: (cameraPreset) =>
    set((state) => ({
      cameraPreset,
      cameraPresetTick: state.cameraPresetTick + 1,
    })),
  setFps: (fps) => set({ fps }),
  setDisplaySlot: (displaySlot) => set({ displaySlot }),
  setActiveTextureMeta: (activeTextureMeta) => set({ activeTextureMeta }),
  setVram: (vramTextures, vramGeometries) => set({ vramTextures, vramGeometries }),
}));
