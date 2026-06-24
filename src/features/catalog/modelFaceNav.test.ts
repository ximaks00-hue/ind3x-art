import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import {
  buildModelFaceNav,
  buildSelectedFaceFromModel,
  groupModelFaceNav,
  pickPreferredStudioFace,
} from "./modelFaceNav";

function mockModel(overrides: Partial<RenderableModel> = {}): RenderableModel {
  return {
    kind: "block",
    modelId: "minecraft:block/test",
    cuboids: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        rotation: null,
        shade: true,
        faces: [
          {
            direction: "up",
            uv: [0, 0, 16, 16],
            texture: "assets/minecraft/textures/block/grass_block_top.png",
            rotation: 0,
            tintindex: 0,
            cullface: null,
          },
          {
            direction: "north",
            uv: [0, 0, 16, 16],
            texture: "assets/minecraft/textures/block/grass_block_side.png",
            rotation: 0,
            tintindex: 0,
            cullface: null,
          },
        ],
      },
    ],
    textureRefs: {},
    textureMeta: {},
    modelRotation: { x: 0, y: 0, z: 0, uvlock: true },
    display: {},
    ambientOcclusion: true,
    ...overrides,
  };
}

describe("modelFaceNav", () => {
  it("lists faces with direction labels", () => {
    const nav = buildModelFaceNav(mockModel());
    expect(nav).toHaveLength(2);
    expect(nav[0]?.direction).toBe("up");
    expect(nav[0]?.label).toContain("Top");
  });

  it("groups multipart cuboids with schematic labels from model id", () => {
    const model = mockModel({
      kind: "multipart",
      modelId: "minecraft:block/fence_post + minecraft:block/fence_side",
      cuboids: [
        mockModel().cuboids[0]!,
        {
          ...mockModel().cuboids[0]!,
          faces: [
            {
              direction: "north",
              uv: [0, 0, 16, 16],
              texture: "assets/minecraft/textures/block/oak_planks.png",
              rotation: 0,
              tintindex: 0,
              cullface: null,
            },
          ],
        },
      ],
    });
    const groups = groupModelFaceNav(buildModelFaceNav(model));
    expect(groups).toHaveLength(2);
    expect(groups[0]?.cuboidLabel).toBe("Fence Post");
    expect(groups[1]?.cuboidLabel).toBe("Fence Side");
    expect(groups[1]?.items[0]?.texturePath).toContain("oak_planks");
  });

  it("UC-2: multipart fence post vs plank use different texture paths", () => {
    const model = mockModel({
      kind: "multipart",
      cuboids: [
        {
          from: [0, 0, 0],
          to: [4, 16, 4],
          rotation: null,
          shade: true,
          faces: [
            {
              direction: "north",
              uv: [0, 0, 16, 16],
              texture: "assets/minecraft/textures/block/test_fence_post.png",
              rotation: 0,
              tintindex: 0,
              cullface: null,
            },
          ],
        },
        {
          from: [0, 0, 0],
          to: [16, 16, 4],
          rotation: null,
          shade: true,
          faces: [
            {
              direction: "north",
              uv: [0, 0, 16, 16],
              texture: "assets/minecraft/textures/block/test_fence_side.png",
              rotation: 0,
              tintindex: 0,
              cullface: null,
            },
          ],
        },
      ],
    });
    const groups = groupModelFaceNav(buildModelFaceNav(model));
    const textures = groups.flatMap((g) => g.items.map((i) => i.texturePath));
    expect(textures).toContain("assets/minecraft/textures/block/test_fence_post.png");
    expect(textures).toContain("assets/minecraft/textures/block/test_fence_side.png");
    expect(new Set(textures).size).toBeGreaterThanOrEqual(2);
  });

  it("prefers top face for studio bootstrap (UC-1)", () => {
    const preferred = pickPreferredStudioFace(mockModel());
    expect(preferred?.direction).toBe("up");
    expect(preferred?.texturePath).toContain("grass_block_top");
  });

  it("builds programmatic selected face for navigator clicks", () => {
    const selected = buildSelectedFaceFromModel(mockModel(), 0, 1);
    expect(selected?.direction).toBe("north");
    expect(selected?.pixel).toEqual([8, 8]);
  });

  it("supports itemGenerated texture previews without cuboids", () => {
    const model = mockModel({
      kind: "itemGenerated",
      cuboids: [],
      textureRefs: { layer0: "assets/ic2/textures/block/copper_ore.png" },
      modelId: "texture:assets/ic2/textures/block/copper_ore.png",
    });
    const nav = buildModelFaceNav(model);
    expect(nav).toHaveLength(1);
    expect(nav[0]?.texturePath).toContain("copper_ore");
    const preferred = pickPreferredStudioFace(model);
    expect(preferred?.texturePath).toContain("copper_ore");
    const selected = buildSelectedFaceFromModel(model, 0, 0);
    expect(selected?.direction).toBe("item");
  });
});
