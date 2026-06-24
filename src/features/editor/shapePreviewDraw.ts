import type { EditorTool } from "../../state/editorStore";
import {
  ellipseFillPixels,
  ellipsePixels,
  hexToRgba,
  linePixels,
  rectPixels,
} from "./tools";
import type { ShapeTool } from "./paintInteraction";

export interface UvRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toLocalPixels(
  [tx, ty]: [number, number],
  region: UvRegion,
): [number, number] {
  return [tx - region.x, ty - region.y];
}

function drawPixelPoints(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  alpha: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const [r, g, b] = hexToRgba(color);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) continue;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** Draw line / rect / ellipse preview using the same pixel lists as commit. */
export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  tool: ShapeTool,
  color: string,
  rectFilled: boolean,
  start: [number, number],
  end: [number, number],
  region: UvRegion,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const [x0, y0] = toLocalPixels(start, region);
  const [x1, y1] = toLocalPixels(end, region);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  if (tool === "line") {
    drawPixelPoints(ctx, linePixels(x0, y0, x1, y1), color, 0.85, canvasWidth, canvasHeight);
    return;
  }

  if (tool === "ellipse") {
    if (rectFilled) {
      drawPixelPoints(
        ctx,
        ellipseFillPixels(x0, y0, x1, y1),
        color,
        0.35,
        canvasWidth,
        canvasHeight,
      );
    }
    drawPixelPoints(
      ctx,
      ellipsePixels(x0, y0, x1, y1),
      color,
      0.85,
      canvasWidth,
      canvasHeight,
    );
    return;
  }

  const outline = rectPixels(x0, y0, x1, y1, false);
  if (rectFilled) {
    drawPixelPoints(
      ctx,
      rectPixels(x0, y0, x1, y1, true),
      color,
      0.35,
      canvasWidth,
      canvasHeight,
    );
  }
  drawPixelPoints(ctx, outline, color, 0.85, canvasWidth, canvasHeight);
}

export function isShapeToolName(tool: EditorTool): tool is ShapeTool {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}
