import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial } from "three";

import type { RenderableModel } from "../../ipc/types";
import { buildFaceOverlayNode, disposeObject3D } from "./buildMesh";

const FIXTURE_RENDERABLE: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/test_stone",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      shade: true,
      rotation: null,
      faces: ["north", "south", "east", "west", "up", "down"].map((direction) => ({
        direction,
        texture: "assets/minecraft/textures/block/test_stone.png",
        uv: [0, 0, 16, 16] as [number, number, number, number],
        rotation: 0,
        tintindex: 0,
        cullface: null,
      })),
    },
  ],
  textureRefs: { all: "assets/minecraft/textures/block/test_stone.png" },
  textureMeta: {
    "assets/minecraft/textures/block/test_stone.png": {
      width: 16,
      height: 16,
      animation: null,
    },
  },
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

function countCompiledVertices(model: RenderableModel): {
  faces: number;
  vertices: number;
  indices: number;
} {
  let faces = 0;
  let vertices = 0;
  let indices = 0;

  for (let cuboidIndex = 0; cuboidIndex < model.cuboids.length; cuboidIndex += 1) {
    const cuboid = model.cuboids[cuboidIndex];
    for (let faceIndex = 0; faceIndex < cuboid.faces.length; faceIndex += 1) {
      const node = buildFaceOverlayNode(
        model,
        cuboidIndex,
        faceIndex,
        new MeshBasicMaterial(),
      );
      if (!node) continue;
      node.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        faces += 1;
        vertices += child.geometry.attributes.position.count;
        const index = child.geometry.index;
        if (index) indices += index.count;
      });
      disposeObject3D(node);
    }
  }

  return { faces, vertices, indices };
}

describe("compile golden", () => {
  it("buildMesh compiles a full cube with stable vertex counts", () => {
    const counts = countCompiledVertices(FIXTURE_RENDERABLE);
    expect(counts).toMatchInlineSnapshot(`
      {
        "faces": 6,
        "indices": 36,
        "vertices": 24,
      }
    `);
  });

  it("item generated model compiles to zero mesh faces", () => {
    const item: RenderableModel = {
      ...FIXTURE_RENDERABLE,
      kind: "itemGenerated",
      cuboids: [],
    };
    expect(countCompiledVertices(item)).toEqual({ faces: 0, vertices: 0, indices: 0 });
  });
});
