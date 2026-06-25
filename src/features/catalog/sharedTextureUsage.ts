import type { RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { formatFaceDirection } from "../../app/studioStatusLabels";
import { buildModelFaceNav } from "./modelFaceNav";

export interface SharedTextureInfo {
  texturePath: string;
  totalFaces: number;
  otherDirections: string[];
  /** Faces that reuse the exact same UV rectangle on this texture. */
  sameUvDirections: string[];
}

function uvKey(uv: [number, number, number, number]): string {
  return uv.join(",");
}

/** Returns usage info when the active texture appears on multiple model faces. */
export function getSharedTextureInfo(
  model: RenderableModel | null,
  selectedFace: SelectedFace | null,
): SharedTextureInfo | null {
  if (!model || !selectedFace) return null;

  const items = buildModelFaceNav(model).filter(
    (item) => item.texturePath === selectedFace.texturePath,
  );
  if (items.length <= 1) return null;

  const current = model.cuboids[selectedFace.cuboidIndex]?.faces[selectedFace.faceIndex];
  const currentUv = current ? uvKey(current.uv) : uvKey(selectedFace.uv);

  const sameUvDirections = items
    .filter((item) => {
      const face = model.cuboids[item.cuboidIndex]?.faces[item.faceIndex];
      return face && uvKey(face.uv) === currentUv;
    })
    .map((item) => formatFaceDirection(item.direction));

  const otherDirections = items
    .filter(
      (item) =>
        item.cuboidIndex !== selectedFace.cuboidIndex ||
        item.faceIndex !== selectedFace.faceIndex,
    )
    .map((item) => formatFaceDirection(item.direction));

  return {
    texturePath: selectedFace.texturePath,
    totalFaces: items.length,
    otherDirections,
    sameUvDirections,
  };
}

export function sharedTextureBannerText(info: SharedTextureInfo): string {
  const dirs = [...new Set(info.otherDirections)].join(", ");
  let text = `This texture is used on ${info.totalFaces} faces`;
  if (dirs) text += ` (${dirs})`;
  text += " — edits apply to the shared image file.";

  const sharedUv = info.sameUvDirections.filter(
    (d) => !info.otherDirections.includes(d) || info.sameUvDirections.length > 1,
  );
  if (info.sameUvDirections.length > 1) {
    const uvDirs = [...new Set(info.sameUvDirections)].join(", ");
    text += ` Same UV region: ${uvDirs} — painting updates all of them.`;
  } else if (sharedUv.length > 0) {
    void sharedUv;
  }

  return text;
}
