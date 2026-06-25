import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Material,
  Object3D,
  Texture,
  Vector3,
} from "three";

import type {
  DisplayTransform,
  ElementRotation,
  ModelRotation,
  ProjectHandle,
  RenderCuboid,
  RenderFace,
  RenderableModel,
} from "../../ipc/types";
import {
  FACE_PICK_KEY,
  type FacePickData,
  type SelectedFace,
} from "../../state/selectionStore";
import { elementRescaleFactor } from "../../lib/elementRotation";
import { buildItemExtrusion } from "./itemExtrusion";
import { loadTexture, tintColorForIndex } from "./textureLoader";
import { faceThreeUvs } from "./uvMapping";

const BLOCK = 1 / 16;

/**
 * In a standalone preview we never know if adjacent blocks cull a face.
 * We do cull faces that are flush with the block boundary AND marked culled
 * only when the model itself is a full-unit cube (from=[0,0,0] to=[16,16,16]).
 * For partial blocks / items we show all faces.
 * The `cullface` field is kept for runtime use; previewer always shows all faces
 * unless in a future "cull-at-boundary" mode — so we simply skip culling here.
 */
/**
 * Determines whether to cull a face in preview mode.
 *
 * A face with `cullface` is meant to be hidden when the adjacent block is
 * present. For standalone preview we only cull when the entire cuboid spans the
 * full 16-unit range on the relevant axis (i.e., is a full cube face at the
 * block boundary). Partial cuboids always show all faces so the user can see
 * non-standard shapes.
 */
export function shouldCullFace(
  cullface: string | null | undefined,
  from: [number, number, number],
  to: [number, number, number],
): boolean {
  if (!cullface) return false;

  // Only cull if the cuboid covers the full block on this axis boundary
  switch (cullface) {
    case "down":
      return from[1] <= 0;
    case "up":
      return to[1] >= 16;
    case "north":
      return from[2] <= 0;
    case "south":
      return to[2] >= 16;
    case "west":
      return from[0] <= 0;
    case "east":
      return to[0] >= 16;
    default:
      return false;
  }
}

type Vec3 = [number, number, number];

function toWorld(c: number): number {
  return c * BLOCK - 0.5;
}

function axisVector(axis: string): Vector3 {
  switch (axis) {
    case "x":
      return new Vector3(1, 0, 0);
    case "y":
      return new Vector3(0, 1, 0);
    case "z":
      return new Vector3(0, 0, 1);
    default:
      return new Vector3(0, 1, 0);
  }
}

function faceCorners(direction: string, from: Vec3, to: Vec3): Vec3[] {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  switch (direction) {
    case "down":
      return [
        [fx, fy, tz],
        [tx, fy, tz],
        [tx, fy, fz],
        [fx, fy, fz],
      ];
    case "up":
      return [
        [fx, ty, fz],
        [tx, ty, fz],
        [tx, ty, tz],
        [fx, ty, tz],
      ];
    case "north":
      return [
        [tx, fy, fz],
        [fx, fy, fz],
        [fx, ty, fz],
        [tx, ty, fz],
      ];
    case "south":
      return [
        [fx, fy, tz],
        [tx, fy, tz],
        [tx, ty, tz],
        [fx, ty, tz],
      ];
    case "west":
      return [
        [fx, fy, fz],
        [fx, fy, tz],
        [fx, ty, tz],
        [fx, ty, fz],
      ];
    case "east":
      return [
        [tx, fy, tz],
        [tx, fy, fz],
        [tx, ty, fz],
        [tx, ty, tz],
      ];
    default:
      return [
        [fx, fy, fz],
        [tx, fy, fz],
        [tx, ty, tz],
        [fx, fy, tz],
      ];
  }
}

const FACE_NORMALS: Record<string, Vec3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

function buildFaceGeometry(
  direction: string,
  from: Vec3,
  to: Vec3,
  face: RenderFace,
  modelRotation?: ModelRotation,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const corners = faceCorners(direction, from, to);
  const normal = FACE_NORMALS[direction] ?? [0, 1, 0];
  const uvCorners = faceThreeUvs(face, modelRotation);

  for (let i = 0; i < 4; i += 1) {
    const [x, y, z] = corners[i];
    positions.push(toWorld(x), toWorld(y), toWorld(z));
    normals.push(normal[0], normal[1], normal[2]);
    uvs.push(uvCorners[i][0], uvCorners[i][1]);
  }

  indices.push(0, 1, 2, 0, 2, 3);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function attachFacePick(mesh: Mesh, pick: FacePickData): void {
  mesh.userData[FACE_PICK_KEY] = pick;
}

function wrapElementRotation(
  object: Object3D,
  rotation: ElementRotation,
): Group {
  const ox = toWorld(rotation.origin[0]);
  const oy = toWorld(rotation.origin[1]);
  const oz = toWorld(rotation.origin[2]);

  const pivot = new Group();
  pivot.position.set(ox, oy, oz);
  pivot.quaternion.setFromAxisAngle(
    axisVector(rotation.axis),
    MathUtils.degToRad(rotation.angle),
  );

  if (rotation.rescale && rotation.angle !== 0) {
    const factor = elementRescaleFactor(rotation.angle, true);
    pivot.scale.set(factor, factor, factor);
  }

  const offset = new Group();
  offset.position.set(-ox, -oy, -oz);
  pivot.add(offset);
  offset.add(object);
  return pivot;
}

function applyDisplayTransform(
  object: Object3D,
  display: DisplayTransform,
): Group {
  const wrapper = new Group();
  wrapper.rotation.set(
    MathUtils.degToRad(display.rotation[0]),
    MathUtils.degToRad(display.rotation[1]),
    MathUtils.degToRad(display.rotation[2]),
  );
  wrapper.position.set(
    display.translation[0] * BLOCK,
    display.translation[1] * BLOCK,
    display.translation[2] * BLOCK,
  );
  const [sx, sy, sz] = display.scale;
  wrapper.scale.set(sx || 1, sy || 1, sz || 1);
  wrapper.add(object);
  return wrapper;
}

function pickItemTexture(model: RenderableModel): string | null {
  if (model.textureRefs.layer0) return model.textureRefs.layer0;
  const values = Object.values(model.textureRefs);
  return values[0] ?? null;
}

function isGeneratedTexturePreview(model: RenderableModel): boolean {
  return (
    model.cuboids.length === 0 &&
    (model.kind === "itemGenerated" || Object.keys(model.textureRefs).length > 0)
  );
}

const DISPLAY_SLOT_FALLBACK = [
  "gui",
  "fixed",
  "firstperson_righthand",
  "thirdperson_righthand",
  "head",
  "ground",
];

export function pickDisplayTransform(
  model: RenderableModel,
  preferredSlot?: string,
): DisplayTransform | null {
  const display = model.display;
  if (preferredSlot && display[preferredSlot]) return display[preferredSlot];
  for (const slot of DISPLAY_SLOT_FALLBACK) {
    if (display[slot]) return display[slot];
  }
  return null;
}

async function buildCuboidMeshes(
  handle: ProjectHandle,
  cuboids: RenderCuboid[],
  model: RenderableModel,
  studioMode = false,
): Promise<Group> {
  const root = new Group();
  const textureMap = new Map<string, Texture>();
  const modelRotation = model.modelRotation;

  const uniquePaths = new Set<string>();
  for (const cuboid of cuboids) {
    for (const face of cuboid.faces) uniquePaths.add(face.texture);
  }
  await Promise.all(
    [...uniquePaths].map(async (path) => {
      textureMap.set(path, await loadTexture(handle, path, model.textureMeta[path]));
    }),
  );

  for (let cuboidIndex = 0; cuboidIndex < cuboids.length; cuboidIndex += 1) {
    const cuboid = cuboids[cuboidIndex];
    const cuboidGroup = new Group();

    for (let faceIndex = 0; faceIndex < cuboid.faces.length; faceIndex += 1) {
      const face = cuboid.faces[faceIndex];
      const geometry = buildFaceGeometry(
        face.direction,
        cuboid.from,
        cuboid.to,
        face,
        modelRotation,
      );
      // cullface: skip faces flush with block boundary when cuboid spans full 16-unit block
      if (!studioMode && shouldCullFace(face.cullface, cuboid.from, cuboid.to)) continue;

      const tint = tintColorForIndex(face.tintindex);
      const material = new MeshLambertMaterial({
        map: textureMap.get(face.texture),
        alphaTest: 0.1,
        transparent: false,
        ...(tint ? { color: tint } : {}),
      });
      const mesh = new Mesh(geometry, material);
      attachFacePick(mesh, { cuboidIndex, faceIndex, face });
      cuboidGroup.add(mesh);
    }

    const node = cuboid.rotation
      ? wrapElementRotation(cuboidGroup, cuboid.rotation)
      : cuboidGroup;
    root.add(node);
  }

  return root;
}

export function buildFaceHighlight(
  model: RenderableModel,
  selected: SelectedFace,
): Object3D | null {
  return buildFaceOverlayNode(
    model,
    selected.cuboidIndex,
    selected.faceIndex,
    new MeshBasicMaterial({
      color: 0x638cff,
      transparent: true,
      opacity: 0.42,
      depthTest: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
}

/** Face-aligned mesh for canvas texture overlays (shape preview, etc.). */
export function buildFaceOverlayNode(
  model: RenderableModel,
  cuboidIndex: number,
  faceIndex: number,
  material: Material,
): Object3D | null {
  const cuboid = model.cuboids[cuboidIndex];
  if (!cuboid) return null;
  const face = cuboid.faces[faceIndex];
  if (!face) return null;

  const geometry = buildFaceGeometry(
    face.direction,
    cuboid.from,
    cuboid.to,
    face,
    model.modelRotation,
  );
  const mesh = new Mesh(geometry, material);

  const cuboidGroup = new Group();
  cuboidGroup.add(mesh);

  return cuboid.rotation
    ? wrapElementRotation(cuboidGroup, cuboid.rotation)
    : cuboidGroup;
}

export function disposeObject3D(object: Object3D, options?: { disposeMaps?: boolean }): void {
  const disposeMaps = options?.disposeMaps ?? false;
  object.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (disposeMaps && "map" in material && material.map) {
          material.map.dispose();
        }
        material.dispose();
      }
    }
  });
}

export async function buildModelGroup(
  model: RenderableModel,
  handle: ProjectHandle,
  preferredDisplaySlot?: string,
  studioMode = false,
): Promise<Group> {
  const root = new Group();

  let content: Group;
  if (isGeneratedTexturePreview(model)) {
    const texturePath = pickItemTexture(model);
    if (!texturePath) {
      content = new Group();
    } else {
      const meta = model.textureMeta[texturePath];
      content = await buildItemExtrusion(handle, texturePath, meta);
      const display = pickDisplayTransform(model, preferredDisplaySlot);
      if (display) {
        content = applyDisplayTransform(content, display);
      }
    }
  } else {
    content = await buildCuboidMeshes(handle, model.cuboids, model, studioMode);
    const display = pickDisplayTransform(model, preferredDisplaySlot);
    if (display) {
      content = applyDisplayTransform(content, display);
    }
  }

  root.add(content);
  root.rotation.x = MathUtils.degToRad(model.modelRotation.x);
  root.rotation.y = MathUtils.degToRad(model.modelRotation.y);
  root.rotation.z = MathUtils.degToRad(model.modelRotation.z);
  return root;
}

export function isFacePickData(value: unknown): value is FacePickData {
  if (typeof value !== "object" || value === null) return false;
  const pick = value as FacePickData;
  return (
    typeof pick.cuboidIndex === "number" &&
    typeof pick.faceIndex === "number" &&
    typeof pick.face === "object"
  );
}

// Re-export for tests / legacy imports
export { faceThreeUvs } from "./uvMapping";
