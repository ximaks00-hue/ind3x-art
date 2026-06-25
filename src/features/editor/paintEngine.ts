import type { ProjectHandle } from "../../ipc/types";
import type { EditorTool } from "../../state/editorStore";
import { TOOL_LABELS } from "../../state/editorStore";
import {
  collectStrokeChanges,
  ellipseToolChanges,
  floodFillChanges,
  linePixels,
  lineToolChanges,
  pixelPerfectFilter,
  pickColor,
  rectToolChanges,
} from "./tools";
import { applyPatch, commitChanges, ensureTextureDocument } from "./documentStore";

export interface PaintPoint {
  x: number;
  y: number;
}

export interface PaintStrokeContext {
  handle: ProjectHandle;
  texturePath: string;
  tool: EditorTool;
  color: string;
  symmetryX: boolean;
  symmetryY: boolean;
  brushSize: number;
  brushOpacity: number;
  fillTolerance?: number;
  pixelPerfectLine?: boolean;
  rectFilled?: boolean;
}

function strokeLabel(tool: EditorTool): string {
  return `${TOOL_LABELS[tool]} stroke`;
}

export async function ensurePaintDocument(
  handle: ProjectHandle,
  texturePath: string,
): Promise<void> {
  await ensureTextureDocument(handle, texturePath);
}

export function pickAtPixel(texturePath: string, x: number, y: number): string | null {
  return pickColor(texturePath, x, y);
}

export async function paintStroke(
  ctx: PaintStrokeContext,
  point: PaintPoint,
  options: { isStroke: boolean; lastPixel: PaintPoint | null },
): Promise<PaintPoint | null> {
  const { handle, texturePath, tool, color } = ctx;
  await ensureTextureDocument(handle, texturePath);

  if (tool === "picker") return point;

  if (tool === "fill") {
    const changes = floodFillChanges(
      texturePath,
      point.x,
      point.y,
      color,
      ctx.fillTolerance ?? 0,
    );
    commitChanges(handle, texturePath, changes, true, "Fill", true);
    return point;
  }

  if (tool === "line" || tool === "rect" || tool === "ellipse") return point;

  let points: [number, number][] =
    options.isStroke && options.lastPixel
      ? linePixels(options.lastPixel.x, options.lastPixel.y, point.x, point.y)
      : [[point.x, point.y]];

  if (ctx.pixelPerfectLine && points.length > 2) {
    points = pixelPerfectFilter(points);
  }

  const changes = collectStrokeChanges(
    texturePath,
    points,
    tool,
    color,
    ctx.symmetryX,
    ctx.symmetryY,
    ctx.brushSize,
    ctx.brushOpacity,
  );
  commitChanges(handle, texturePath, changes, true, strokeLabel(tool));
  return point;
}

export async function paintLine(
  handle: ProjectHandle,
  texturePath: string,
  from: PaintPoint,
  to: PaintPoint,
  ctx: Pick<
    PaintStrokeContext,
    | "color"
    | "symmetryX"
    | "symmetryY"
    | "brushSize"
    | "brushOpacity"
    | "pixelPerfectLine"
  >,
): Promise<void> {
  await ensureTextureDocument(handle, texturePath);
  const changes = lineToolChanges(
    texturePath,
    from.x,
    from.y,
    to.x,
    to.y,
    "pencil",
    ctx.color,
    ctx.symmetryX,
    ctx.symmetryY,
    ctx.brushSize,
    ctx.brushOpacity,
    ctx.pixelPerfectLine ?? false,
  );
  commitChanges(handle, texturePath, changes, true, "Line", true);
}

export function applyPixelPatch(
  handle: ProjectHandle | null,
  texturePath: string,
  changes: Parameters<typeof applyPatch>[2],
  recordUndo = true,
  label = "edit",
): void {
  applyPatch(handle, texturePath, changes, recordUndo, label);
}

export function applyBrushAt(
  handle: ProjectHandle,
  ctx: PaintStrokeContext,
  tx: number,
  ty: number,
  isStroke: boolean,
  lastPixel: PaintPoint | null,
): PaintPoint {
  const { texturePath, tool, color } = ctx;
  let points: [number, number][] =
    isStroke && lastPixel ? linePixels(lastPixel.x, lastPixel.y, tx, ty) : [[tx, ty]];

  if (ctx.pixelPerfectLine && points.length > 2) {
    points = pixelPerfectFilter(points);
  }

  const changes = collectStrokeChanges(
    texturePath,
    points,
    tool,
    color,
    ctx.symmetryX,
    ctx.symmetryY,
    ctx.brushSize,
    ctx.brushOpacity,
  );
  commitChanges(handle, texturePath, changes, true, strokeLabel(tool));
  return { x: tx, y: ty };
}

export function commitShapeAt(
  handle: ProjectHandle,
  ctx: PaintStrokeContext,
  start: PaintPoint,
  end: PaintPoint,
): void {
  const {
    texturePath,
    tool,
    color,
    symmetryX,
    symmetryY,
    brushSize,
    brushOpacity,
    rectFilled,
    pixelPerfectLine,
  } = ctx;
  const changes =
    tool === "line"
      ? lineToolChanges(
          texturePath,
          start.x,
          start.y,
          end.x,
          end.y,
          "pencil",
          color,
          symmetryX,
          symmetryY,
          brushSize,
          brushOpacity,
          pixelPerfectLine ?? false,
        )
      : tool === "rect"
        ? rectToolChanges(
            texturePath,
            start.x,
            start.y,
            end.x,
            end.y,
            "pencil",
            color,
            rectFilled ?? false,
            symmetryX,
            symmetryY,
            brushSize,
            brushOpacity,
          )
        : ellipseToolChanges(
            texturePath,
            start.x,
            start.y,
            end.x,
            end.y,
            color,
            rectFilled ?? false,
            symmetryX,
            symmetryY,
            brushSize,
            brushOpacity,
          );
  commitChanges(handle, texturePath, changes, true, TOOL_LABELS[tool], true);
}
