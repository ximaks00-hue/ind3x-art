import type { Remote } from "comlink";

import type { ProjectHandle } from "../../ipc/types";
import type { EditorTool } from "../../state/editorStore";
import { useEditorStore } from "../../state/editorStore";
import {
  commitShapeAt,
  paintStroke,
  pickAtPixel,
  type PaintPoint,
  type PaintStrokeContext,
} from "./paintEngine";
import { applyFillAtPixel, applyWandAtPixel } from "./paintWorkerOps";
import type { PixelWorkerApi } from "./pixelWorker";
import { isShapeToolName } from "./shapePreviewDraw";
import { ensureTextureDocument } from "./textureDocument";

export type ShapeTool = "line" | "rect" | "ellipse";

export function isShapeTool(tool: EditorTool): tool is ShapeTool {
  return isShapeToolName(tool);
}

/** Tools that only act on pointer-down (no drag stroke). */
export function isClickOnlyTool(tool: EditorTool): boolean {
  return tool === "fill" || tool === "picker" || tool === "wand" || isShapeTool(tool);
}

/** Build the same paint context object used by TextureCanvas `paintCtx()`. */
export function buildPaintStrokeContext(
  handle: ProjectHandle,
  texturePath: string,
  overrides?: Partial<Pick<PaintStrokeContext, "tool" | "color">>,
): PaintStrokeContext {
  const s = useEditorStore.getState();
  return {
    handle,
    texturePath,
    tool: overrides?.tool ?? s.tool,
    color: overrides?.color ?? s.color,
    symmetryX: s.symmetryX,
    symmetryY: s.symmetryY,
    brushSize: s.brushSize,
    brushOpacity: s.brushOpacity,
    fillTolerance: s.fillTolerance,
    pixelPerfectLine: s.pixelPerfectLine,
    rectFilled: s.rectFilled,
  };
}

export interface PaintPixelCallbacks {
  onColorPicked?: (hex: string) => void;
  onWandSelection?: (sel: [number, number, number, number]) => void;
  onComplete?: () => void;
}

export interface PaintPixelOptions {
  callbacks?: PaintPixelCallbacks;
  pixelWorker?: Remote<PixelWorkerApi> | null;
}

/**
 * Unified pointer-down / pointer-move paint for 2D canvas and 3D face raycast.
 * Returns the last painted pixel for stroke continuity.
 */
export async function paintAtTexturePixel(
  ctx: PaintStrokeContext,
  x: number,
  y: number,
  isStroke: boolean,
  lastPixel: PaintPoint | null,
  options?: PaintPixelOptions,
): Promise<PaintPoint | null> {
  const { handle, texturePath, tool } = ctx;
  const callbacks = options?.callbacks;
  await ensureTextureDocument(handle, texturePath);

  if (tool === "picker") {
    const picked = pickAtPixel(texturePath, x, y);
    if (picked) {
      callbacks?.onColorPicked?.(picked);
      useEditorStore.getState().setColor(picked);
    }
    callbacks?.onComplete?.();
    return { x, y };
  }

  if (tool === "fill") {
    await applyFillAtPixel(
      ctx,
      x,
      y,
      options?.pixelWorker ?? null,
      callbacks?.onComplete,
    );
    return { x, y };
  }

  if (tool === "wand") {
    await applyWandAtPixel(ctx, x, y, options?.pixelWorker ?? null, (sel) => {
      useEditorStore.getState().setSelection(sel);
      callbacks?.onWandSelection?.(sel);
    });
    callbacks?.onComplete?.();
    return { x, y };
  }

  if (isShapeTool(tool)) {
    return { x, y };
  }

  const result = await paintStroke(ctx, { x, y }, { isStroke, lastPixel });
  callbacks?.onComplete?.();
  return result;
}

export function commitPaintShape(
  ctx: PaintStrokeContext,
  start: PaintPoint,
  end: PaintPoint,
): void {
  commitShapeAt(ctx.handle, ctx, start, end);
}
