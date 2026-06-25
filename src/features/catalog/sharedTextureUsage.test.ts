import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import { getSharedTextureInfo, sharedTextureBannerText } from "./sharedTextureUsage";

const cubeModel: RenderableModel = {
  kind: "block",
  modelId: "test:cube",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      rotation: null,
      shade: true,
      faces: ["down", "up", "north", "south", "west", "east"].map((direction) => ({
        direction,
        uv: [0, 0, 16, 16] as [number, number, number, number],
        texture: "assets/minecraft/textures/block/stone.png",
        rotation: 0,
        tintindex: -1,
        cullface: null,
      })),
    },
  ],
  textureRefs: { all: "assets/minecraft/textures/block/stone.png" },
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

describe("sharedTextureUsage", () => {
  it("reports six shared faces for cube_all UV", () => {
    const info = getSharedTextureInfo(cubeModel, {
      cuboidIndex: 0,
      faceIndex: 1,
      direction: "up",
      texturePath: "assets/minecraft/textures/block/stone.png",
      uv: [0, 0, 16, 16],
      rotation: 0,
      tintindex: -1,
      hitUv: [0.5, 0.5],
      pixel: [8, 8],
    });
    expect(info?.totalFaces).toBe(6);
    expect(sharedTextureBannerText(info!)).toContain("6 faces");
    expect(sharedTextureBannerText(info!)).toContain("Same UV region");
  });
});
