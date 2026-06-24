import type { ProjectHandle } from "../../ipc/types";
import type { EditorTool } from "../../state/editorStore";
import {
  buildPaintStrokeContext,
  commitPaintShape,
  isClickOnlyTool,
  isShapeTool,
  paintAtTexturePixel,
} from "./paintInteraction";
import { paintLine, pickAtPixel, type PaintStrokeContext } from "./paintEngine";

export { pickAtPixel, buildPaintStrokeContext, type PaintStrokeContext };

/** @deprecated Prefer buildPaintStrokeContext + paintAtTexturePixel */
export async function paintAtPixel(
  handle: ProjectHandle,
  texturePath: string,
  x: number,
  y: number,
  tool: EditorTool,
  color: string,
  isStroke: boolean,
  lastPixel: [number, number] | null,
): Promise<[number, number] | null> {
  const ctx = buildPaintStrokeContext(handle, texturePath, { tool, color });
  const result = await paintAtTexturePixel(
    ctx,
    x,
    y,
    isStroke,
    lastPixel ? { x: lastPixel[0], y: lastPixel[1] } : null,
  );
  return result ? [result.x, result.y] : null;
}

export async function paintLineOnTexture(
  handle: ProjectHandle,
  texturePath: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): Promise<void> {
  const ctx = buildPaintStrokeContext(handle, texturePath, { tool: "line", color });
  await paintLine(handle, texturePath, { x: x0, y: y0 }, { x: x1, y: y1 }, ctx);
}

export { isClickOnlyTool, isShapeTool, commitPaintShape, paintAtTexturePixel };
