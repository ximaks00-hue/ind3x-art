import type { RenderFace } from "../../ipc/types";
import { getTextureCanvas, getOriginalTextureCanvas } from "../editor/textureDocument";
import { faceUvRegion } from "../viewer3d/uvMapping";

/** Draw face UV region onto a canvas (no PNG encode). Returns false if source is missing. */
export function drawFacePreviewToCanvas(
  canvas: HTMLCanvasElement,
  face: RenderFace,
): boolean {
  const source = getTextureCanvas(face.texture) ?? getOriginalTextureCanvas(face.texture);
  if (!source) return false;

  const region = faceUvRegion(face, source.width, source.height);
  const w = Math.max(1, region.width);
  const h = Math.max(1, region.height);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    w,
    h,
  );
  return true;
}
