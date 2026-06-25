import { describe, expect, it } from "vitest";

import { buildFullTextureSpriteFace, textureSpriteDimensions } from "./textureFaceSelection";

describe("textureFaceSelection", () => {
  it("defaults to 16×16 when meta is missing", () => {
    expect(textureSpriteDimensions(null)).toEqual({ width: 16, height: 16 });
    const face = buildFullTextureSpriteFace("assets/minecraft/textures/block/stone.png", "up");
    expect(face.uv).toEqual([0, 0, 16, 16]);
    expect(face.pixel).toEqual([8, 8]);
  });

  it("uses real texture dimensions for HD sprites", () => {
    const face = buildFullTextureSpriteFace(
      "assets/minecraft/textures/block/stone.png",
      "item",
      { width: 32, height: 32 },
    );
    expect(face.uv).toEqual([0, 0, 32, 32]);
    expect(face.pixel).toEqual([16, 16]);
  });
});
