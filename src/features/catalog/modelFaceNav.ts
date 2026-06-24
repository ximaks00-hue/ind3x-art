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

export interface UniqueTextureChip {
  id: string;
  texturePath: string;
  label: string;
  cuboidLabel: string;
  faces: ModelFaceNavItem[];
}

function titleCasePart(segment: string): string {
  return segment
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Human label for a multipart cuboid (e.g. fence_post → Fence Post). */
export function cuboidLabelFor(model: RenderableModel, cuboidIndex: number): string {
  const multipart = model.cuboids.length > 1 || model.kind === "multipart";
  if (!multipart) return "Block";

  const parts = model.modelId.split(" + ");
  const partId = parts[cuboidIndex];
  if (partId) {
    const stem = partId.split("/").pop()?.replace(/^block\//, "") ?? "";
    if (stem) return titleCasePart(stem);
  }
  return `Part ${cuboidIndex + 1}`;
}

/** Schematic label for multipart models, e.g. «Post + Plank». */
export function multipartSchematicLabel(model: RenderableModel): string | null {
  if (model.cuboids.length <= 1 && model.kind !== "multipart") return null;
  const labels = model.cuboids.map((_, i) => cuboidLabelFor(model, i));
  const unique = [...new Set(labels)];
  return unique.length > 1 ? unique.join(" + ") : null;
}

export function buildModelFaceNav(model: RenderableModel): ModelFaceNavItem[] {
  const items: ModelFaceNavItem[] = [];

  if (model.cuboids.length === 0 && model.kind === "itemGenerated") {
    const texturePath =
      model.textureRefs.layer0 ?? Object.values(model.textureRefs)[0];
    if (texturePath) {
      const stem = textureBasename(texturePath);
      items.push({
        id: "0:0",
        cuboidIndex: 0,
        faceIndex: 0,
        direction: "item",
        texturePath,
        label: `Item · ${stem}`,
        cuboidLabel: "Item",
      });
    }
    return items;
  }

  for (let cuboidIndex = 0; cuboidIndex < model.cuboids.length; cuboidIndex += 1) {
    const cuboid = model.cuboids[cuboidIndex]!;
    const cuboidLabel = cuboidLabelFor(model, cuboidIndex);

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

/** One chip per unique texture path; clicking jumps to the first matching face. */
export function buildUniqueTextureChips(model: RenderableModel): UniqueTextureChip[] {
  const nav = buildModelFaceNav(model);
  const byTexture = new Map<string, ModelFaceNavItem[]>();
  for (const item of nav) {
    const list = byTexture.get(item.texturePath) ?? [];
    list.push(item);
    byTexture.set(item.texturePath, list);
  }

  return [...byTexture.entries()].map(([texturePath, faces]) => {
    const stem = textureBasename(texturePath);
    const cuboidLabels = [...new Set(faces.map((f) => f.cuboidLabel))];
    return {
      id: texturePath,
      texturePath,
      label: stem,
      cuboidLabel: cuboidLabels.length > 1 ? cuboidLabels.join(" + ") : (faces[0]?.cuboidLabel ?? "Block"),
      faces,
    };
  });
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
  if (model.cuboids.length === 0 && model.kind === "itemGenerated") {
    const nav = buildModelFaceNav(model);
    const item = nav.find(
      (face) => face.cuboidIndex === cuboidIndex && face.faceIndex === faceIndex,
    );
    if (!item) return null;
    return {
      cuboidIndex,
      faceIndex,
      direction: item.direction,
      texturePath: item.texturePath,
      uv: [0, 0, 16, 16],
      rotation: 0,
      tintindex: -1,
      hitUv: [0.5, 0.5],
      pixel: [8, 8],
    };
  }

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
