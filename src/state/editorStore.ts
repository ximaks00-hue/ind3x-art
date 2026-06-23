import { create } from "zustand";

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

interface EditorState {
  tool: EditorTool;
  color: string;
  revision: number;
  symmetryX: boolean;
  rectFilled: boolean;
  recentColors: string[];
  comparatorEnabled: boolean;
  /** Current cursor coords in texture space (null when outside canvas) */
  cursorX: number | null;
  cursorY: number | null;
  /** Editor zoom level (1 = 1px per screen px) */
  zoom: number;
  /** Active animation frame index (for animated textures) */
  activeFrame: number;
  /** Active selection rect [x0, y0, x1, y1] in texture space, or null */
  selection: [number, number, number, number] | null;
  setTool: (tool: EditorTool) => void;
  setColor: (color: string) => void;
  bumpRevision: () => void;
  toggleSymmetryX: () => void;
  setRectFilled: (filled: boolean) => void;
  pushRecentColor: (color: string) => void;
  toggleComparator: () => void;
  setCursor: (x: number | null, y: number | null) => void;
  setZoom: (zoom: number) => void;
  setActiveFrame: (frame: number) => void;
  stepFrame: (delta: number, total: number) => void;
  setSelection: (sel: [number, number, number, number] | null) => void;
  /** Replace recent colors with an imported palette */
  importPalette: (colors: string[]) => void;
}

const DEFAULT_RECENT = ["#ffffff", "#000000", "#c6c6c6", "#8b8b8b"];

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: "pencil",
  color: "#ffffff",
  revision: 0,
  symmetryX: false,
  rectFilled: false,
  recentColors: DEFAULT_RECENT,
  comparatorEnabled: false,
  cursorX: null,
  cursorY: null,
  zoom: 8,
  activeFrame: 0,
  selection: null,
  setTool: (tool) => set({ tool }),
  setColor: (color) => {
    set({ color });
    get().pushRecentColor(color);
  },
  bumpRevision: () => set((s) => ({ revision: s.revision + 1 })),
  toggleSymmetryX: () => set((s) => ({ symmetryX: !s.symmetryX })),
  setRectFilled: (rectFilled) => set({ rectFilled }),
  pushRecentColor: (color) => {
    const normalized = color.toLowerCase();
    const next = [
      normalized,
      ...get().recentColors.filter((c) => c.toLowerCase() !== normalized),
    ].slice(0, 8);
    set({ recentColors: next });
  },
  toggleComparator: () => set((s) => ({ comparatorEnabled: !s.comparatorEnabled })),
  setCursor: (x, y) => set({ cursorX: x, cursorY: y }),
  setZoom: (zoom) => set({ zoom: Math.max(1, Math.min(64, zoom)) }),
  setActiveFrame: (activeFrame) => set({ activeFrame }),
  stepFrame: (delta, total) =>
    set((s) => ({
      activeFrame: total > 0 ? (s.activeFrame + delta + total) % total : 0,
    })),
  setSelection: (selection) => set({ selection }),
  importPalette: (colors) => set({ recentColors: colors.slice(0, 32) }),
}));

export const TOOL_LABELS: Record<EditorTool, string> = {
  pencil: "Pencil",
  eraser: "Eraser",
  fill: "Fill",
  picker: "Picker",
  line: "Line",
  rect: "Rect",
  ellipse: "Ellipse",
  select: "Select",
  move: "Move",
  wand: "Wand",
  lighten: "Lighten",
  darken: "Darken",
  dither: "Dither",
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
