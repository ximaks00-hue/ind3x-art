import type { RenderableModel, RenderFace } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { formatFaceDirection } from "../../app/studioStatusLabels";
import { faceUvRegion } from "../viewer3d/uvMapping";
import { buildModelFaceNav } from "../catalog/modelFaceNav";

export interface AtlasFaceRegion {
  direction: string;
  label: string;
  cuboidIndex: number;
  faceIndex: number;
  region: { x: number; y: number; width: number; height: number };
  selected: boolean;
}

export function collectAtlasFaceRegions(
  model: RenderableModel | null,
  texturePath: string,
  textureWidth: number,
  textureHeight: number,
  selectedFace: SelectedFace | null,
): AtlasFaceRegion[] {
  if (!model || textureWidth <= 0 || textureHeight <= 0) return [];

  return buildModelFaceNav(model)
    .filter((item) => item.texturePath === texturePath)
    .map((item) => {
      const face = model.cuboids[item.cuboidIndex]?.faces[item.faceIndex] as
        | RenderFace
        | undefined;
      if (!face) return null;
      const region = faceUvRegion(face, textureWidth, textureHeight);
      const selected =
        selectedFace?.cuboidIndex === item.cuboidIndex &&
        selectedFace.faceIndex === item.faceIndex;
      return {
        direction: item.direction,
        label: formatFaceDirection(item.direction),
        cuboidIndex: item.cuboidIndex,
        faceIndex: item.faceIndex,
        region,
        selected,
      };
    })
    .filter((entry): entry is AtlasFaceRegion => entry !== null);
}

export function pointInRegion(
  x: number,
  y: number,
  region: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    x >= region.x &&
    y >= region.y &&
    x < region.x + region.width &&
    y < region.y + region.height
  );
}

export function drawAtlasGuide(
  ctx: CanvasRenderingContext2D,
  regions: AtlasFaceRegion[],
  viewWidth: number,
  viewHeight: number,
  textureWidth: number,
  textureHeight: number,
): void {
  const scaleX = viewWidth / textureWidth;
  const scaleY = viewHeight / textureHeight;

  for (const entry of regions) {
    const { region, selected, label } = entry;
    const x = region.x * scaleX;
    const y = region.y * scaleY;
    const w = region.width * scaleX;
    const h = region.height * scaleY;

    ctx.strokeStyle = selected ? "rgba(99, 140, 255, 0.95)" : "rgba(255, 200, 80, 0.75)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.setLineDash(selected ? [] : [4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = selected ? "rgba(99, 140, 255, 0.12)" : "rgba(255, 200, 80, 0.08)";
    ctx.fillRect(x, y, w, h);

    if (w > 24 && h > 12) {
      ctx.fillStyle = selected ? "rgba(99, 140, 255, 0.9)" : "rgba(255, 220, 120, 0.9)";
      ctx.font = "10px sans-serif";
      ctx.fillText(label, x + 3, y + 11);
    }
  }
  ctx.setLineDash([]);
}
