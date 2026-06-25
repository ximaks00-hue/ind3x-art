import { create } from "zustand";

import type { TextureAnimationMeta, ProjectHandle } from "../ipc/types";
import {
  deleteAnimationFramePixels,
  duplicateAnimationFramePixels,
  metaAfterDelete,
  metaAfterDuplicate,
} from "../features/editor/animationFrameOps";

export interface FaceShapeDraft {
  cuboidIndex: number;
  faceIndex: number;
  texturePath: string;
  start: [number, number];
  end: [number, number];
}

export type EditorTool =
  | "pencil"
  | "eraser"
  | "fill"
  | "picker"
  | "line"
  | "rect"
  | "ellipse"
  | "select"
  | "move"
  | "wand"
  | "lighten"
  | "darken"
  | "dither";

export type BrushBlendMode = "normal" | "replace";

const DEFAULT_RECENT_COLORS = [
  "#ffffff",
  "#000000",
  "#c6c6c6",
  "#8b8b8b",
  "#7f7f7f",
  "#555555",
] as const;

function normalizeHexColor(color: string): string {
  return color.toLowerCase();
}

function pushRecentColorList(colors: string[], color: string): string[] {
  const normalized = normalizeHexColor(color);
  return [normalized, ...colors.filter((c) => normalizeHexColor(c) !== normalized)].slice(
    0,
    16,
  );
}

interface EditorState {
  tool: EditorTool;
  color: string;
  revision: number;
  brushSize: number;
  brushOpacity: number;
  fillTolerance: number;
  brushMode: BrushBlendMode;
  symmetryX: boolean;
  symmetryY: boolean;
  stabilizer: number;
  pixelPerfectLine: boolean;
  rectFilled: boolean;
  recentColors: string[];
  cursorX: number | null;
  cursorY: number | null;
  zoom: number;
  activeFrame: number;
  selection: [number, number, number, number] | null;
  onionSkin: boolean;
  atlasGuide: boolean;
  pickFrom3dHighlight: boolean;
  faceShapeDraft: FaceShapeDraft | null;
  animationOverrides: Record<string, TextureAnimationMeta>;
  setTool: (tool: EditorTool) => void;
  setColor: (color: string) => void;
  bumpRevision: () => void;
  setBrushSize: (size: number) => void;
  setBrushOpacity: (opacity: number) => void;
  setFillTolerance: (tolerance: number) => void;
  setBrushMode: (mode: BrushBlendMode) => void;
  toggleSymmetryX: () => void;
  toggleSymmetryY: () => void;
  setStabilizer: (level: number) => void;
  setPixelPerfectLine: (enabled: boolean) => void;
  setRectFilled: (filled: boolean) => void;
  pushRecentColor: (color: string) => void;
  setCursor: (x: number | null, y: number | null) => void;
  setZoom: (zoom: number) => void;
  setActiveFrame: (activeFrame: number, total?: number) => void;
  stepFrame: (delta: number, total: number) => void;
  setSelection: (sel: [number, number, number, number] | null) => void;
  importPalette: (colors: string[]) => void;
  setOnionSkin: (enabled: boolean) => void;
  setAtlasGuide: (enabled: boolean) => void;
  setPickFrom3dHighlight: (enabled: boolean) => void;
  setFaceShapeDraft: (draft: FaceShapeDraft | null) => void;
  setAnimationOverride: (path: string, meta: TextureAnimationMeta | null) => void;
  getAnimationMeta: (
    path: string,
    fallback?: TextureAnimationMeta | null,
  ) => TextureAnimationMeta | undefined;
  duplicateAnimationFrame: (
    path: string,
    frameIndex: number,
    baseMeta?: TextureAnimationMeta,
    handle?: ProjectHandle | null,
  ) => void;
  deleteAnimationFrame: (
    path: string,
    frameIndex: number,
    baseMeta?: TextureAnimationMeta,
    handle?: ProjectHandle | null,
  ) => void;
  /** Reset per-session state (animation overrides, face draft, selection) on project open/close. */
  resetEditorSession: () => void;
}

const DEFAULT_RECENT = [...DEFAULT_RECENT_COLORS];

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "pencil",
  color: "#ffffff",
  revision: 0,
  brushSize: 1,
  brushOpacity: 1,
  fillTolerance: 0,
  brushMode: "normal",
  symmetryX: false,
  symmetryY: false,
  stabilizer: 0,
  pixelPerfectLine: false,
  rectFilled: false,
  recentColors: DEFAULT_RECENT,
  cursorX: null,
  cursorY: null,
  zoom: 8,
  activeFrame: 0,
  selection: null,
  onionSkin: false,
  atlasGuide: false,
  pickFrom3dHighlight: true,
  faceShapeDraft: null,
  animationOverrides: {},
  setTool: (tool) => set({ tool }),
  setColor: (color) => {
    const normalized = normalizeHexColor(color);
    set((s) => ({
      color: normalized,
      recentColors: pushRecentColorList(s.recentColors, normalized),
    }));
  },
  bumpRevision: () => set((s) => ({ revision: s.revision + 1 })),
  setBrushSize: (brushSize) => set({ brushSize: Math.max(1, Math.min(32, brushSize)) }),
  setBrushOpacity: (brushOpacity) =>
    set({ brushOpacity: Math.max(0.05, Math.min(1, brushOpacity)) }),
  setFillTolerance: (fillTolerance) =>
    set({ fillTolerance: Math.max(0, Math.min(255, fillTolerance)) }),
  setBrushMode: (brushMode) => set({ brushMode }),
  toggleSymmetryX: () => set((s) => ({ symmetryX: !s.symmetryX })),
  toggleSymmetryY: () => set((s) => ({ symmetryY: !s.symmetryY })),
  setStabilizer: (stabilizer) =>
    set({ stabilizer: Math.max(0, Math.min(8, stabilizer)) }),
  setPixelPerfectLine: (pixelPerfectLine) => set({ pixelPerfectLine }),
  setRectFilled: (rectFilled) => set({ rectFilled }),
  pushRecentColor: (color) => {
    set({ recentColors: pushRecentColorList(get().recentColors, color) });
  },
  setCursor: (x, y) => set({ cursorX: x, cursorY: y }),
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(64, zoom)) }),
  setActiveFrame: (activeFrame: number, total?: number) =>
    set({
      activeFrame:
        total && total > 0
          ? Math.max(0, Math.min(activeFrame, total - 1))
          : Math.max(0, activeFrame),
    }),
  stepFrame: (delta, total) =>
    set((s) => ({
      activeFrame: total > 0 ? (s.activeFrame + delta + total) % total : 0,
    })),
  setSelection: (selection) => set({ selection }),
  importPalette: (colors) => set({ recentColors: colors.slice(0, 32) }),
  setOnionSkin: (onionSkin) => set({ onionSkin }),
  setAtlasGuide: (atlasGuide) => set({ atlasGuide }),
  setPickFrom3dHighlight: (pickFrom3dHighlight) => set({ pickFrom3dHighlight }),
  setFaceShapeDraft: (faceShapeDraft) => set({ faceShapeDraft }),
  setAnimationOverride: (path, meta) =>
    set((s) => {
      const next = { ...s.animationOverrides };
      if (meta) next[path] = meta;
      else delete next[path];
      return { animationOverrides: next };
    }),
  getAnimationMeta: (path, fallback) => get().animationOverrides[path] ?? fallback,
  duplicateAnimationFrame: (path, frameIndex, baseMeta, handle = null) => {
    const meta = get().animationOverrides[path] ?? baseMeta;
    if (!meta || meta.frames.length === 0) return;
    if (frameIndex < 0 || frameIndex >= meta.frames.length) return;
    duplicateAnimationFramePixels(handle, path, frameIndex, meta);
    const nextMeta = metaAfterDuplicate(meta, frameIndex);
    set((s) => ({
      animationOverrides: {
        ...s.animationOverrides,
        [path]: nextMeta,
      },
      activeFrame: frameIndex + 1,
    }));
  },
  deleteAnimationFrame: (path, frameIndex, baseMeta, handle = null) => {
    const meta = get().animationOverrides[path] ?? baseMeta;
    if (!meta || meta.frames.length <= 1) return;
    if (frameIndex < 0 || frameIndex >= meta.frames.length) return;
    deleteAnimationFramePixels(handle, path, frameIndex, meta);
    const nextMeta = metaAfterDelete(meta, frameIndex);
    set((s) => ({
      animationOverrides: {
        ...s.animationOverrides,
        [path]: nextMeta,
      },
      activeFrame: Math.min(s.activeFrame, nextMeta.frames.length - 1),
    }));
  },
  resetEditorSession: () =>
    set({
      animationOverrides: {},
      faceShapeDraft: null,
      selection: null,
      activeFrame: 0,
      zoom: 8,
      brushSize: 1,
      brushOpacity: 1,
      brushMode: "normal",
      revision: 0,
    }),
}));

export const TOOL_LABELS: Record<EditorTool, string> = {
  pencil: "Pencil",
  eraser: "Eraser",
  fill: "Fill",
  picker: "Picker",
  line: "Line",
  rect: "Rectangle",
  ellipse: "Ellipse",
  select: "Select",
  move: "Move",
  wand: "Magic wand",
  lighten: "Lighten",
  darken: "Darken",
  dither: "Dither",
};

export const TOOL_ICONS: Record<EditorTool, string> = {
  pencil: "✎",
  eraser: "◻",
  fill: "▣",
  picker: "◎",
  line: "╱",
  rect: "▭",
  ellipse: "○",
  select: "⬚",
  move: "✥",
  wand: "✦",
  lighten: "◐",
  darken: "◑",
  dither: "▦",
};

export const TOOL_HOTKEYS: Record<EditorTool, string> = {
  pencil: "B",
  eraser: "E",
  fill: "G",
  picker: "I",
  line: "L",
  rect: "U",
  ellipse: "O",
  select: "M",
  move: "V",
  wand: "W",
  lighten: "",
  darken: "",
  dither: "",
};
