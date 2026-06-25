import { describe, expect, it } from "vitest";

import { Group, Mesh } from "three";

import { FACE_PICK_KEY } from "../../state/selectionStore";
import {
  isMiniSceneObject,
  MINI_SCENE_ROOT_NAME,
  MINI_SCENE_TILE_PREFIX,
  stripFacePickData,
} from "./buildMesh";
import { itemExtrusionFaceUvForPixel } from "./itemExtrusion";

describe("mini-scene picking helpers", () => {
  it("detects ghost tiles by ancestor name", () => {
    const root = new Group();
    root.name = MINI_SCENE_ROOT_NAME;
    const tile = new Group();
    tile.name = `${MINI_SCENE_TILE_PREFIX}1:0:1`;
    const mesh = new Mesh();
    tile.add(mesh);
    root.add(tile);

    expect(isMiniSceneObject(mesh)).toBe(true);
    expect(isMiniSceneObject(new Mesh())).toBe(false);
  });

  it("strips face pick metadata from ghost template clones", () => {
    const mesh = new Mesh();
    mesh.userData[FACE_PICK_KEY] = { cuboidIndex: 0, faceIndex: 0, face: {} };
    const root = new Group();
    root.add(mesh);

    stripFacePickData(root);
    expect(mesh.userData[FACE_PICK_KEY]).toBeUndefined();
  });
});

describe("itemExtrusionFaceUvForPixel", () => {
  it("maps a grid cell to pixel-space face UV", () => {
    expect(itemExtrusionFaceUvForPixel(2, 3, 16, 16)).toEqual([2, 3, 3, 4]);
  });
});
