import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import { isFacePickData, pickDisplayTransform, shouldCullFace } from "./buildMesh";

const baseModel = (): RenderableModel => ({
  kind: "block",
  modelId: "minecraft:block/stone",
  cuboids: [],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {
    gui: {
      rotation: [30, 225, 0],
      translation: [0, 0, 0],
      scale: [0.625, 0.625, 0.625],
    },
    fixed: {
      rotation: [0, 0, 0],
      translation: [0, 0, 0],
      scale: [0.5, 0.5, 0.5],
    },
  },
  ambientOcclusion: true,
});

describe("pickDisplayTransform", () => {
  it("returns preferred slot when present", () => {
    const model = baseModel();
    const transform = pickDisplayTransform(model, "gui");
    expect(transform?.scale).toEqual([0.625, 0.625, 0.625]);
  });

  it("falls back through display slots", () => {
    const model = baseModel();
    delete model.display.gui;
    const transform = pickDisplayTransform(model);
    expect(transform?.scale).toEqual([0.5, 0.5, 0.5]);
  });

  it("returns null when display is empty", () => {
    expect(pickDisplayTransform({ ...baseModel(), display: {} })).toBeNull();
  });
});

describe("shouldCullFace", () => {
  it("culls bottom face when cuboid sits on block floor", () => {
    expect(shouldCullFace("down", [0, 0, 0], [16, 8, 16])).toBe(true);
    expect(shouldCullFace("down", [0, 4, 0], [16, 16, 16])).toBe(false);
  });

  it("culls top face when cuboid reaches block ceiling", () => {
    expect(shouldCullFace("up", [0, 8, 0], [16, 16, 16])).toBe(true);
    expect(shouldCullFace("up", [0, 0, 0], [16, 8, 16])).toBe(false);
  });
});

describe("isFacePickData", () => {
  it("accepts valid pick payloads", () => {
    expect(
      isFacePickData({
        cuboidIndex: 0,
        faceIndex: 1,
        face: {
          direction: "north",
          texture: "assets/minecraft/textures/block/stone.png",
          uv: [0, 0, 16, 16],
          rotation: 0,
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid payloads", () => {
    expect(isFacePickData(null)).toBe(false);
    expect(isFacePickData({ cuboidIndex: 0 })).toBe(false);
  });
});
