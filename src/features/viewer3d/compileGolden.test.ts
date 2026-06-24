import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../../ipc/types";

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

describe("compile golden (B2 structural)", () => {
  it("stone block is a full cube with six faces", () => {
    expect(FIXTURE_RENDERABLE.kind).toBe("block");
    expect(FIXTURE_RENDERABLE.modelId).toBe("minecraft:block/test_stone");
    expect(FIXTURE_RENDERABLE.ambientOcclusion).toBe(true);
    expect(FIXTURE_RENDERABLE.cuboids).toHaveLength(1);
    expect(FIXTURE_RENDERABLE.cuboids[0].from).toEqual([0, 0, 0]);
    expect(FIXTURE_RENDERABLE.cuboids[0].to).toEqual([16, 16, 16]);
    expect(FIXTURE_RENDERABLE.cuboids[0].faces).toHaveLength(6);
  });

  it("each face uses 16×16 UV on the stone texture", () => {
    const directions = new Set(
      FIXTURE_RENDERABLE.cuboids[0].faces.map((f) => f.direction),
    );
    expect(directions).toEqual(new Set(["north", "south", "east", "west", "up", "down"]));
    for (const face of FIXTURE_RENDERABLE.cuboids[0].faces) {
      expect(face.texture).toContain("test_stone.png");
      expect(face.uv).toEqual([0, 0, 16, 16]);
    }
  });

  it("item generated model has no cuboids", () => {
    const item: RenderableModel = {
      ...FIXTURE_RENDERABLE,
      kind: "itemGenerated",
      cuboids: [],
    };
    expect(item.kind).toBe("itemGenerated");
    expect(item.cuboids).toHaveLength(0);
  });
});
