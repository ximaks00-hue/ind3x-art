import type { EditorTool } from "../../state/editorStore";
import type { ShapeTool } from "./paintInteraction";

export interface UvRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toLocal(
  [tx, ty]: [number, number],
  region: UvRegion,
  canvasWidth: number,
  canvasHeight: number,
): [number, number] {
  return [
    ((tx - region.x) / region.width) * canvasWidth,
    ((ty - region.y) / region.height) * canvasHeight,
  ];
}

/** Draw line / rect / ellipse preview (2D canvas overlay or 3D face texture). */
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
  const [x0, y0] = toLocal(start, region, canvasWidth, canvasHeight);
  const [x1, y1] = toLocal(end, region, canvasWidth, canvasHeight);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.85;

  if (tool === "line") {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    return;
  }

  if (tool === "ellipse") {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (rectFilled) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 0.85;
    }
    ctx.stroke();
    return;
  }

  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (rectFilled) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(left, top, w, h);
    ctx.globalAlpha = 0.85;
  }
  ctx.strokeRect(left, top, w, h);
}

export function isShapeToolName(tool: EditorTool): tool is ShapeTool {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}
