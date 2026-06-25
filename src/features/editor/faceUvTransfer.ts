import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { faceUvRegion } from "../viewer3d/uvMapping";
import { buildSelectedFaceFromModel } from "../catalog/modelFaceNav";
import {
  commitChanges,
  ensureTextureDocument,
  getActiveLayerContext,
  getLayerPixel,
  getTextureCanvas,
} from "./textureDocument";
import type { PixelChange, Rgba } from "./textureDocumentCore";

export type FaceUvTransform = "copy" | "mirrorH" | "mirrorV" | "rotate90";

function readRegionPixels(
  canvas: HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
): ImageData {
  const ctx = canvas.getContext("2d")!;
  return ctx.getImageData(region.x, region.y, region.width, region.height);
}

function transformImageData(
  data: ImageData,
  transform: FaceUvTransform,
): ImageData {
  const { width: w, height: h } = data;
  const out = document.createElement("canvas");
  const swap = transform === "rotate90";
  out.width = swap ? h : w;
  out.height = swap ? w : h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  src.getContext("2d")!.putImageData(data, 0, 0);

  ctx.save();
  switch (transform) {
    case "mirrorH":
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0);
      break;
    case "mirrorV":
      ctx.translate(0, h);
      ctx.scale(1, -1);
      ctx.drawImage(src, 0, 0);
      break;
    case "rotate90":
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(src, 0, 0);
      break;
    default:
      ctx.drawImage(src, 0, 0);
  }
  ctx.restore();

  return ctx.getImageData(0, 0, out.width, out.height);
}

function buildPixelChanges(
  texturePath: string,
  targetX: number,
  targetY: number,
  image: ImageData,
): PixelChange[] {
  const layer = getActiveLayerContext(texturePath);
  if (!layer) return [];

  const changes: PixelChange[] = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const tx = targetX + x;
      const ty = targetY + y;
      const idx = (y * image.width + x) * 4;
      const after: Rgba = [
        image.data[idx]!,
        image.data[idx + 1]!,
        image.data[idx + 2]!,
        image.data[idx + 3]!,
      ];
      const before = getLayerPixel(texturePath, layer.layerId, tx, ty);
      if (!before) continue;
      if (
        before[0] === after[0] &&
        before[1] === after[1] &&
        before[2] === after[2] &&
        before[3] === after[3]
      ) {
        continue;
      }
      changes.push({ x: tx, y: ty, before, after, layerId: layer.layerId });
    }
  }
  return changes;
}

/** Copy pixels from the selected face UV region onto another face (same or other texture). */
export async function copyFaceUvToTarget(
  handle: ProjectHandle,
  model: RenderableModel,
  sourceFace: SelectedFace,
  targetCuboidIndex: number,
  targetFaceIndex: number,
  transform: FaceUvTransform = "copy",
): Promise<boolean> {
  const targetSelected = buildSelectedFaceFromModel(
    model,
    targetCuboidIndex,
    targetFaceIndex,
  );
  if (!targetSelected) return false;

  await ensureTextureDocument(handle, sourceFace.texturePath);
  if (targetSelected.texturePath !== sourceFace.texturePath) {
    await ensureTextureDocument(handle, targetSelected.texturePath);
  }

  const sourceCanvas = getTextureCanvas(sourceFace.texturePath);
  const targetCanvas = getTextureCanvas(targetSelected.texturePath);
  if (!sourceCanvas || !targetCanvas) return false;

  const sourceRegion = faceUvRegion(
    {
      direction: sourceFace.direction,
      uv: sourceFace.uv,
      texture: sourceFace.texturePath,
      rotation: sourceFace.rotation,
      tintindex: sourceFace.tintindex,
      cullface: null,
    },
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const targetRegion = faceUvRegion(
    {
      direction: targetSelected.direction,
      uv: targetSelected.uv,
      texture: targetSelected.texturePath,
      rotation: targetSelected.rotation,
      tintindex: targetSelected.tintindex,
      cullface: null,
    },
    targetCanvas.width,
    targetCanvas.height,
  );

  const pixels = readRegionPixels(sourceCanvas, sourceRegion);
  const transformed = transformImageData(pixels, transform);

  if (transformed.width !== targetRegion.width || transformed.height !== targetRegion.height) {
    const scale = document.createElement("canvas");
    scale.width = targetRegion.width;
    scale.height = targetRegion.height;
    const sctx = scale.getContext("2d")!;
    sctx.imageSmoothingEnabled = false;
    const tmp = document.createElement("canvas");
    tmp.width = transformed.width;
    tmp.height = transformed.height;
    tmp.getContext("2d")!.putImageData(transformed, 0, 0);
    sctx.drawImage(tmp, 0, 0, targetRegion.width, targetRegion.height);
    const scaled = sctx.getImageData(0, 0, targetRegion.width, targetRegion.height);
    const changes = buildPixelChanges(
      targetSelected.texturePath,
      targetRegion.x,
      targetRegion.y,
      scaled,
    );
    if (changes.length === 0) return false;
    commitChanges(handle, targetSelected.texturePath, changes, true, `copy from ${sourceFace.direction}`);
    return true;
  }

  const changes = buildPixelChanges(
    targetSelected.texturePath,
    targetRegion.x,
    targetRegion.y,
    transformed,
  );
  if (changes.length === 0) return false;
  commitChanges(
    handle,
    targetSelected.texturePath,
    changes,
    true,
    `copy from ${sourceFace.direction}`,
  );
  return true;
}
