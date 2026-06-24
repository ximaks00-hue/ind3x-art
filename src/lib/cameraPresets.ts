import type { RenderableModel } from "../ipc/types";

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

export const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  free: "Free",
  front: "Front",
  iso: "Iso",
  top: "Top",
  inventory: "GUI",
};

export const CAMERA_PRESET_HOTKEYS: Record<string, CameraPreset> = {
  "1": "iso",
  "2": "front",
  "3": "top",
  "4": "inventory",
  "5": "free",
};

export const CAMERA_PRESETS: {
  id: CameraPreset;
  label: string;
  hotkey: string;
}[] = [
  { id: "iso", label: "Iso", hotkey: "1" },
  { id: "front", label: "Front", hotkey: "2" },
  { id: "top", label: "Top", hotkey: "3" },
  { id: "inventory", label: "GUI", hotkey: "4" },
];

/** Three.js camera positions for preset rig (excludes free). */
export const CAMERA_PRESET_TRANSFORMS: Record<
  Exclude<CameraPreset, "free">,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  front: { position: [0, 0, 2.2], target: [0, 0, 0] },
  iso: { position: [1.35, 1.05, 1.35], target: [0, 0, 0] },
  top: { position: [0, 2.3, 0.01], target: [0, 0, 0] },
  inventory: { position: [0.2, 0.15, 1.9], target: [0, 0, 0] },
};

export const DISPLAY_SLOTS: DisplaySlot[] = [
  "gui",
  "fixed",
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "firstperson_righthand",
  "firstperson_lefthand",
  "head",
  "ground",
];

export type ComparatorMode = "2d" | "3d" | null;

/** Before-model snapshot for 3D comparator. */
export type ViewerComparatorSnapshot = RenderableModel | null;
