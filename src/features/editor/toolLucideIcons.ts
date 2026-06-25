import type { LucideIcon } from "lucide-react";
import {
  Circle,
  Eraser,
  Grid2x2,
  Moon,
  MousePointer2,
  Move,
  PaintBucket,
  Pencil,
  Pipette,
  Slash,
  Square,
  Sun,
  Wand2,
} from "lucide-react";

import type { EditorTool } from "../../state/editorStore";

export const TOOL_LUCIDE_ICONS: Record<EditorTool, LucideIcon> = {
  pencil: Pencil,
  eraser: Eraser,
  fill: PaintBucket,
  picker: Pipette,
  wand: Wand2,
  line: Slash,
  rect: Square,
  ellipse: Circle,
  select: MousePointer2,
  move: Move,
  lighten: Sun,
  darken: Moon,
  dither: Grid2x2,
};
