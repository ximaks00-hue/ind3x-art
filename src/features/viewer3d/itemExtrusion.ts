import * as THREE from "three";

import type { ProjectHandle, RenderFace, TextureMetaInfo } from "../../ipc/types";
import { FACE_PICK_KEY, type FacePickData } from "../../state/selectionStore";
import { loadTexture } from "./textureLoader";

const ITEM_DISPLAY_SCALE = 0.9;
const EXTRUSION_DEPTH = 1 / 16;
/** Cap extrusion grid resolution — side walls scale with pixel count squared. */
const EXTRUSION_GRID_MAX = 64;
const MAX_SIDE_WALL_PIXELS = 48 * 48;

type AlphaGrid = {
  width: number;
  height: number;
  opaque: (x: number, y: number) => boolean;
};

function readAlphaGrid(image: CanvasImageSource): AlphaGrid {
  const canvas = document.createElement("canvas");
  let width = "width" in image && typeof image.width === "number" ? image.width : 16;
  let height =
    "height" in image && typeof image.height === "number" ? image.height : 16;
  if (width > EXTRUSION_GRID_MAX || height > EXTRUSION_GRID_MAX) {
    const scale = EXTRUSION_GRID_MAX / Math.max(width, height);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      width,
      height,
      opaque: () => false,
    };
  }
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    opaque: (x, y) => data[(y * width + x) * 4 + 3] > 12,
  };
}

function pixelBounds(
  x: number,
  y: number,
  grid: AlphaGrid,
): { x0: number; x1: number; y0: number; y1: number } {
  const { width, height } = grid;
  const scale = ITEM_DISPLAY_SCALE;
  const x0 = (x / width - 0.5) * scale;
  const x1 = ((x + 1) / width - 0.5) * scale;
  const y1 = (0.5 - y / height) * scale;
  const y0 = (0.5 - (y + 1) / height) * scale;
  return { x0, x1, y0, y1 };
}

function uvForPixel(
  x: number,
  y: number,
  grid: AlphaGrid,
): [number, number, number, number] {
  const { width, height } = grid;
  const u0 = x / width;
  const u1 = (x + 1) / width;
  const v0 = y / height;
  const v1 = (y + 1) / height;
  return [u0, v0, u1, v1];
}

function normalizedUvToFaceUv(
  uv: [number, number, number, number],
  grid: AlphaGrid,
): [number, number, number, number] {
  const [u0, v0, u1, v1] = uv;
  return [u0 * grid.width, v0 * grid.height, u1 * grid.width, v1 * grid.height];
}

function itemFace(
  texturePath: string,
  uv: [number, number, number, number],
): RenderFace {
  return {
    direction: "item",
    uv,
    texture: texturePath,
    rotation: 0,
    tintindex: -1,
    cullface: null,
  };
}

function addQuad(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  corners: [number, number, number][],
  normal: [number, number, number],
  uvRect: [number, number, number, number],
): void {
  const base = positions.length / 3;
  const [u0, v0, u1, v1] = uvRect;
  const uvCorners: [number, number][] = [
    [u0, 1 - v1],
    [u1, 1 - v1],
    [u1, 1 - v0],
    [u0, 1 - v0],
  ];

  for (let i = 0; i < 4; i += 1) {
    const [x, y, z] = corners[i];
    positions.push(x, y, z);
    normals.push(normal[0], normal[1], normal[2]);
    uvs.push(uvCorners[i][0], uvCorners[i][1]);
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function buildGeometryFromBuffers(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function attachFacePick(mesh: THREE.Mesh, pick: FacePickData): void {
  mesh.userData[FACE_PICK_KEY] = pick;
  mesh.userData.__meshTexturePath = pick.face.texture;
  if (pick.face.tintindex !== undefined) {
    mesh.userData.__meshTintIndex = pick.face.tintindex;
  }
}

function addPickableQuad(
  group: THREE.Group,
  material: THREE.MeshLambertMaterial,
  corners: [number, number, number][],
  normal: [number, number, number],
  uvRect: [number, number, number, number],
  pick: FacePickData,
): void {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  addQuad(positions, normals, uvs, indices, corners, normal, uvRect);
  const geometry = buildGeometryFromBuffers(positions, normals, uvs, indices);
  const mesh = new THREE.Mesh(geometry, material);
  attachFacePick(mesh, pick);
  group.add(mesh);
}

export async function buildItemExtrusion(
  handle: ProjectHandle,
  texturePath: string,
  meta?: TextureMetaInfo,
): Promise<THREE.Group> {
  const texture = await loadTexture(handle, texturePath, meta);
  const image = texture.image as CanvasImageSource;
  const grid = readAlphaGrid(image);
  const { width, height } = grid;
  const halfZ = EXTRUSION_DEPTH / 2;

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  const fullFaceUv: [number, number, number, number] = [0, 0, width, height];
  const fullPick: FacePickData = {
    cuboidIndex: 0,
    faceIndex: 0,
    face: itemFace(texturePath, fullFaceUv),
  };

  const frontCorners: [number, number, number][] = [
    [-ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, halfZ],
    [ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, halfZ],
    [ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, halfZ],
    [-ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, halfZ],
  ];
  addPickableQuad(group, material, frontCorners, [0, 0, 1], [0, 0, 1, 1], fullPick);

  const backCorners: [number, number, number][] = [
    [ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, -halfZ],
    [-ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, -halfZ],
    [-ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, -halfZ],
    [ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, -halfZ],
  ];
  addPickableQuad(group, material, backCorners, [0, 0, -1], [0, 0, 1, 1], {
    cuboidIndex: 0,
    faceIndex: 1,
    face: itemFace(texturePath, fullFaceUv),
  });

  const buildSideWalls = width * height <= MAX_SIDE_WALL_PIXELS;
  if (buildSideWalls) {
    let sideFaceIndex = 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!grid.opaque(x, y)) continue;
        const bounds = pixelBounds(x, y, grid);
        const pixelUv = uvForPixel(x, y, grid);
        const faceUv = normalizedUvToFaceUv(pixelUv, grid);
        const sidePick: FacePickData = {
          cuboidIndex: 0,
          faceIndex: sideFaceIndex,
          face: itemFace(texturePath, faceUv),
        };
        sideFaceIndex += 1;

        if (x === 0 || !grid.opaque(x - 1, y)) {
          addPickableQuad(
            group,
            material,
            [
              [bounds.x0, bounds.y0, halfZ],
              [bounds.x0, bounds.y0, -halfZ],
              [bounds.x0, bounds.y1, -halfZ],
              [bounds.x0, bounds.y1, halfZ],
            ],
            [-1, 0, 0],
            pixelUv,
            sidePick,
          );
        }
        if (x === width - 1 || !grid.opaque(x + 1, y)) {
          addPickableQuad(
            group,
            material,
            [
              [bounds.x1, bounds.y1, halfZ],
              [bounds.x1, bounds.y1, -halfZ],
              [bounds.x1, bounds.y0, -halfZ],
              [bounds.x1, bounds.y0, halfZ],
            ],
            [1, 0, 0],
            pixelUv,
            sidePick,
          );
        }
        if (y === 0 || !grid.opaque(x, y - 1)) {
          addPickableQuad(
            group,
            material,
            [
              [bounds.x0, bounds.y0, halfZ],
              [bounds.x1, bounds.y0, halfZ],
              [bounds.x1, bounds.y0, -halfZ],
              [bounds.x0, bounds.y0, -halfZ],
            ],
            [0, -1, 0],
            pixelUv,
            sidePick,
          );
        }
        if (y === height - 1 || !grid.opaque(x, y + 1)) {
          addPickableQuad(
            group,
            material,
            [
              [bounds.x0, bounds.y1, -halfZ],
              [bounds.x1, bounds.y1, -halfZ],
              [bounds.x1, bounds.y1, halfZ],
              [bounds.x0, bounds.y1, halfZ],
            ],
            [0, 1, 0],
            pixelUv,
            sidePick,
          );
        }
      }
    }
  }

  return group;
}

/** @internal Exported for unit tests — maps a grid cell to pixel-space face UV. */
export function itemExtrusionFaceUvForPixel(
  x: number,
  y: number,
  gridWidth: number,
  gridHeight: number,
): [number, number, number, number] {
  const u0 = x / gridWidth;
  const u1 = (x + 1) / gridWidth;
  const v0 = y / gridHeight;
  const v1 = (y + 1) / gridHeight;
  return [u0 * gridWidth, v0 * gridHeight, u1 * gridWidth, v1 * gridHeight];
}
