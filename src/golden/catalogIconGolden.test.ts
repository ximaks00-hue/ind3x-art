import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../ipc/types";
import { shouldUpgradeTo3d } from "../features/catalog/catalogIconRules";

const GRASS_BLOCK_ICON: RenderableModel = {
  kind: "itemModel",
  modelId: "minecraft:item/test_stone",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      shade: true,
      rotation: null,
      faces: ["north", "south", "east", "west", "up", "down"].map((direction) => ({
        direction,
        texture: "assets/minecraft/textures/block/test_stone.png",
        uv: [0, 0, 16, 16],
        rotation: 0,
        tintindex: 0,
        cullface: null,
      })),
    },
  ],
  textureRefs: { all: "assets/minecraft/textures/block/test_stone.png" },
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {
    gui: {
      rotation: [30, 225, 0],
      translation: [0, 0, 0],
      scale: [0.625, 0.625, 0.625],
    },
  },
  ambientOcclusion: true,
};

const SWORD_ICON: RenderableModel = {
  kind: "itemGenerated",
  modelId: "minecraft:item/test_sword",
  cuboids: [],
  textureRefs: { layer0: "assets/minecraft/textures/item/test_sword.png" },
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {
    gui: {
      rotation: [30, 225, 0],
      translation: [0, 0, 0],
      scale: [0.625, 0.625, 0.625],
    },
  },
  ambientOcclusion: true,
};

const GOLDEN_ICONS: RenderableModel[] = [
  GRASS_BLOCK_ICON,
  SWORD_ICON,
  { ...GRASS_BLOCK_ICON, modelId: "minecraft:block/studio_block_1" },
  { ...SWORD_ICON, modelId: "minecraft:item/diamond_sword" },
  {
    ...GRASS_BLOCK_ICON,
    modelId: "minecraft:block/dirt",
    cuboids: GRASS_BLOCK_ICON.cuboids.map((c) => ({
      ...c,
      faces: c.faces.map((f) => ({
        ...f,
        texture: "assets/minecraft/textures/block/dirt.png",
      })),
    })),
  },
];

describe("catalog icon golden (B structural)", () => {
  it("grass block icon model is 3D cube with gui display", () => {
    expect(GRASS_BLOCK_ICON.cuboids).toHaveLength(1);
    expect(GRASS_BLOCK_ICON.display.gui?.scale).toEqual([0.625, 0.625, 0.625]);
    expect(GRASS_BLOCK_ICON.kind).not.toBe("itemGenerated");
  });

  it("sword icon uses itemGenerated extrusion path", () => {
    expect(SWORD_ICON.kind).toBe("itemGenerated");
    expect(SWORD_ICON.cuboids).toHaveLength(0);
    expect(SWORD_ICON.textureRefs.layer0).toContain("test_sword");
  });

  it("auto mode always schedules 3D for blocks and items", () => {
    const block = {
      kind: "block" as const,
      texturePaths: ["assets/minecraft/textures/block/grass_block.png"],
    };
    const item = { kind: "item" as const, texturePaths: [] };
    expect(shouldUpgradeTo3d(block as never, "auto")).toBe(true);
    expect(shouldUpgradeTo3d(item as never, "auto")).toBe(true);
  });

  it("defines five golden reference icon models", () => {
    expect(GOLDEN_ICONS).toHaveLength(5);
    for (const model of GOLDEN_ICONS) {
      expect(model.display.gui).toBeDefined();
    }
  });
});
