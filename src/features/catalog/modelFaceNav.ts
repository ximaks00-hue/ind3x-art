import type { RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { formatFaceDirection, textureBasename } from "../../app/studioStatusLabels";
import { faceThreeUvs } from "../viewer3d/uvMapping";

export { formatFaceDirection, textureBasename } from "../../app/studioStatusLabels";

export interface ModelFaceNavItem {
  id: string;
  cuboidIndex: number;
  faceIndex: number;
  direction: string;
  texturePath: string;
  label: string;
  cuboidLabel: string;
}

export interface ModelFaceNavGroup {
  cuboidIndex: number;
  cuboidLabel: string;
  items: ModelFaceNavItem[];
}

export function buildModelFaceNav(model: RenderableModel): ModelFaceNavItem[] {
  const multipart = model.cuboids.length > 1 || model.kind === "multipart";
  const items: ModelFaceNavItem[] = [];

  for (let cuboidIndex = 0; cuboidIndex < model.cuboids.length; cuboidIndex += 1) {
    const cuboid = model.cuboids[cuboidIndex]!;
    const cuboidLabel = multipart ? `Part ${cuboidIndex + 1}` : "Block";

    for (let faceIndex = 0; faceIndex < cuboid.faces.length; faceIndex += 1) {
      const face = cuboid.faces[faceIndex]!;
      const stem = textureBasename(face.texture);
      items.push({
        id: `${cuboidIndex}:${faceIndex}`,
        cuboidIndex,
        faceIndex,
        direction: face.direction,
        texturePath: face.texture,
        label: `${formatFaceDirection(face.direction)} · ${stem}`,
        cuboidLabel,
      });
    }
  }

  return items;
}

export function groupModelFaceNav(items: ModelFaceNavItem[]): ModelFaceNavGroup[] {
  const groups = new Map<number, ModelFaceNavGroup>();
  for (const item of items) {
    const existing = groups.get(item.cuboidIndex);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.cuboidIndex, {
        cuboidIndex: item.cuboidIndex,
        cuboidLabel: item.cuboidLabel,
        items: [item],
      });
    }
  }
  return [...groups.values()];
}

export function buildSelectedFaceFromModel(
  model: RenderableModel,
  cuboidIndex: number,
  faceIndex: number,
): SelectedFace | null {
  const face = model.cuboids[cuboidIndex]?.faces[faceIndex];
  if (!face) return null;

  const corners = faceThreeUvs(face, model.modelRotation);
  const hitU =
    (Math.min(...corners.map(([u]) => u)) + Math.max(...corners.map(([u]) => u))) / 2;
  const hitV =
    (Math.min(...corners.map(([, v]) => v)) + Math.max(...corners.map(([, v]) => v))) / 2;

  const [u1, v1, u2, v2] = face.uv;
  const pixel: [number, number] = [
    Math.floor((Math.min(u1, u2) + Math.max(u1, u2)) / 2),
    Math.floor((Math.min(v1, v2) + Math.max(v1, v2)) / 2),
  ];

  return {
    cuboidIndex,
    faceIndex,
    direction: face.direction,
    texturePath: face.texture,
    uv: face.uv,
    rotation: face.rotation,
    tintindex: face.tintindex,
    hitUv: [hitU, hitV],
    pixel,
  };
}

/** UC-1: prefer top face; UC-2 multipart: first part face. */
export function pickPreferredStudioFace(model: RenderableModel): SelectedFace | null {
  const nav = buildModelFaceNav(model);
  if (!nav.length) return null;

  const up = nav.find((item) => item.direction === "up");
  if (up) {
    return buildSelectedFaceFromModel(model, up.cuboidIndex, up.faceIndex);
  }

  const first = nav[0]!;
  return buildSelectedFaceFromModel(model, first.cuboidIndex, first.faceIndex);
}

export function isSameModelFace(
  selected: SelectedFace | null,
  cuboidIndex: number,
  faceIndex: number,
): boolean {
  return selected?.cuboidIndex === cuboidIndex && selected?.faceIndex === faceIndex;
}
