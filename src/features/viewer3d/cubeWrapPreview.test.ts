import { describe, expect, it } from "vitest";

import { buildCubeAllPreviewModel } from "./cubeWrapPreview";

describe("buildCubeAllPreviewModel", () => {
  it("maps full texture UV on all six faces", () => {
    const model = buildCubeAllPreviewModel("minecraft:textures/block/stone.png", {
      width: 32,
      height: 32,
      animation: null,
    });

    expect(model.modelId).toBe("cube_wrap:minecraft:textures/block/stone.png");
    expect(model.cuboids).toHaveLength(1);
    expect(model.cuboids[0]!.faces).toHaveLength(6);
    for (const face of model.cuboids[0]!.faces) {
      expect(face.texture).toBe("minecraft:textures/block/stone.png");
      expect(face.uv).toEqual([0, 0, 16, 16]);
    }
  });

  it("defaults to 16×16 when meta is missing", () => {
    const model = buildCubeAllPreviewModel("textures/block/test.png");
    expect(model.textureMeta["textures/block/test.png"]).toEqual({
      width: 16,
      height: 16,
      animation: null,
    });
  });
});
