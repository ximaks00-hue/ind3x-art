import * as THREE from "three";

import type { ProjectHandle, RenderFace, TextureMetaInfo } from "../../ipc/types";
import { FACE_PICK_KEY, type FacePickData } from "../../state/selectionStore";
import { loadTexture } from "./textureLoader";

const ITEM_DISPLAY_SCALE = 0.9;
const EXTRUSION_DEPTH = 1 / 16;
const MAX_ITEM_TEXTURE_DIM = 512;

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
  if (width > MAX_ITEM_TEXTURE_DIM || height > MAX_ITEM_TEXTURE_DIM) {
    const scale = MAX_ITEM_TEXTURE_DIM / Math.max(width, height);
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

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const syntheticFace: RenderFace = {
    direction: "item",
    uv: [0, 0, 16, 16],
    texture: texturePath,
    rotation: 0,
    tintindex: -1,
    cullface: null,
  };

  // Front + back planes
  const frontCorners: [number, number, number][] = [
    [-ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, halfZ],
    [ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, halfZ],
    [ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, halfZ],
    [-ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, halfZ],
  ];
  addQuad(positions, normals, uvs, indices, frontCorners, [0, 0, 1], [0, 0, 1, 1]);

  const backCorners: [number, number, number][] = [
    [ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, -halfZ],
    [-ITEM_DISPLAY_SCALE / 2, -ITEM_DISPLAY_SCALE / 2, -halfZ],
    [-ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, -halfZ],
    [ITEM_DISPLAY_SCALE / 2, ITEM_DISPLAY_SCALE / 2, -halfZ],
  ];
  addQuad(positions, normals, uvs, indices, backCorners, [0, 0, -1], [0, 0, 1, 1]);

  // Side walls along alpha edges
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!grid.opaque(x, y)) continue;
      const bounds = pixelBounds(x, y, grid);
      const pixelUv = uvForPixel(x, y, grid);

      if (x === 0 || !grid.opaque(x - 1, y)) {
        addQuad(
          positions,
          normals,
          uvs,
          indices,
          [
            [bounds.x0, bounds.y0, halfZ],
            [bounds.x0, bounds.y0, -halfZ],
            [bounds.x0, bounds.y1, -halfZ],
            [bounds.x0, bounds.y1, halfZ],
          ],
          [-1, 0, 0],
          pixelUv,
        );
      }
      if (x === width - 1 || !grid.opaque(x + 1, y)) {
        addQuad(
          positions,
          normals,
          uvs,
          indices,
          [
            [bounds.x1, bounds.y1, halfZ],
            [bounds.x1, bounds.y1, -halfZ],
            [bounds.x1, bounds.y0, -halfZ],
            [bounds.x1, bounds.y0, halfZ],
          ],
          [1, 0, 0],
          pixelUv,
        );
      }
      if (y === 0 || !grid.opaque(x, y - 1)) {
        addQuad(
          positions,
          normals,
          uvs,
          indices,
          [
            [bounds.x0, bounds.y0, halfZ],
            [bounds.x1, bounds.y0, halfZ],
            [bounds.x1, bounds.y0, -halfZ],
            [bounds.x0, bounds.y0, -halfZ],
          ],
          [0, -1, 0],
          pixelUv,
        );
      }
      if (y === height - 1 || !grid.opaque(x, y + 1)) {
        addQuad(
          positions,
          normals,
          uvs,
          indices,
          [
            [bounds.x0, bounds.y1, -halfZ],
            [bounds.x1, bounds.y1, -halfZ],
            [bounds.x1, bounds.y1, halfZ],
            [bounds.x0, bounds.y1, halfZ],
          ],
          [0, 1, 0],
          pixelUv,
        );
      }
    }
  }

  const group = new THREE.Group();
  const geometry = buildGeometryFromBuffers(positions, normals, uvs, indices);
  const mesh = new THREE.Mesh(geometry, material);
  attachFacePick(mesh, {
    cuboidIndex: 0,
    faceIndex: 0,
    face: syntheticFace,
  });
  group.add(mesh);
  return group;
}
