import { create } from "zustand";

import type { TextureMetaInfo, RenderableModel } from "../ipc/types";
import type { CameraPreset, DisplaySlot } from "../lib/cameraPresets";
import type { LightingPreset } from "../lib/lightingPresets";
import { CAMERA_PRESET_HOTKEYS, CAMERA_PRESET_LABELS } from "../lib/cameraPresets";

export type { CameraPreset, DisplaySlot } from "../lib/cameraPresets";
export type { LightingPreset } from "../lib/lightingPresets";
export { CAMERA_PRESET_HOTKEYS, CAMERA_PRESET_LABELS };

export interface FaceZoomRequest {
  position: [number, number, number];
  target: [number, number, number];
  tick: number;
}

interface ViewerState {
  cameraPreset: CameraPreset;
  cameraPresetTick: number;
  cameraResetTick: number;
  faceZoomRequest: FaceZoomRequest | null;
  lightingPreset: LightingPreset;
  showGrid: boolean;
  showVignette: boolean;
  showDevOverlay: boolean;
  uvDebugMode: boolean;
  fps: number;
  displaySlot: DisplaySlot;
  activeTextureMeta: Record<string, TextureMetaInfo>;
  currentRenderable: RenderableModel | null;
  vramTextures: number;
  vramGeometries: number;
  textureReloadTick: number;
  setCameraPreset: (preset: CameraPreset) => void;
  resetCamera: () => void;
  requestFaceZoom: (
    position: [number, number, number],
    target: [number, number, number],
  ) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setShowGrid: (show: boolean) => void;
  setShowVignette: (show: boolean) => void;
  setShowDevOverlay: (show: boolean) => void;
  setUvDebugMode: (enabled: boolean) => void;
  setFps: (fps: number) => void;
  setDisplaySlot: (slot: DisplaySlot) => void;
  setActiveTextureMeta: (meta: Record<string, TextureMetaInfo>) => void;
  setCurrentRenderable: (model: RenderableModel | null) => void;
  setVram: (textures: number, geometries: number) => void;
  bumpTextureReloadTick: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  cameraPreset: "iso",
  cameraPresetTick: 0,
  cameraResetTick: 0,
  faceZoomRequest: null,
  lightingPreset: "studio",
  showGrid: true,
  showVignette: true,
  showDevOverlay: false,
  uvDebugMode: false,
  fps: 0,
  displaySlot: "gui",
  activeTextureMeta: {},
  currentRenderable: null,
  vramTextures: 0,
  vramGeometries: 0,
  textureReloadTick: 0,
  setCameraPreset: (cameraPreset) =>
    set((state) => ({
      cameraPreset,
      cameraPresetTick: state.cameraPresetTick + 1,
    })),
  resetCamera: () =>
    set((state) => ({
      cameraPreset: "iso",
      cameraPresetTick: state.cameraPresetTick + 1,
      cameraResetTick: state.cameraResetTick + 1,
      faceZoomRequest: null,
    })),
  requestFaceZoom: (position, target) =>
    set((state) => ({
      faceZoomRequest: {
        position,
        target,
        tick: (state.faceZoomRequest?.tick ?? 0) + 1,
      },
    })),
  setLightingPreset: (lightingPreset) => set({ lightingPreset }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowVignette: (showVignette) => set({ showVignette }),
  setShowDevOverlay: (showDevOverlay) => set({ showDevOverlay }),
  setUvDebugMode: (uvDebugMode) => set({ uvDebugMode }),
  setFps: (fps) => set({ fps }),
  setDisplaySlot: (displaySlot) => set({ displaySlot }),
  setActiveTextureMeta: (activeTextureMeta) => set({ activeTextureMeta }),
  setCurrentRenderable: (currentRenderable) => set({ currentRenderable }),
  setVram: (vramTextures, vramGeometries) => set({ vramTextures, vramGeometries }),
  bumpTextureReloadTick: () =>
    set((state) => ({ textureReloadTick: state.textureReloadTick + 1 })),
}));
