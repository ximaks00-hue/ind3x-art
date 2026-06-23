import { describe, expect, it } from "vitest";

import type { ModelRotation, RenderFace } from "../../ipc/types";
import {
  blockUvRotationAddition,
  effectiveFaceRotation,
  faceThreeUvs,
  faceUvRegion,
  hitUvToPixel,
} from "./uvMapping";

const face = (uv: [number, number, number, number], rotation = 0): RenderFace => ({
  direction: "north",
  texture: "assets/minecraft/textures/block/stone.png",
  uv,
  rotation,
  tintindex: 0,
});

describe("blockUvRotationAddition", () => {
  const rot: ModelRotation = { x: 90, y: 180, z: 0, uvlock: false };

  it("adds x rotation on vertical faces", () => {
    expect(blockUvRotationAddition("up", rot)).toBe(90);
    expect(blockUvRotationAddition("down", rot)).toBe(90);
  });

  it("adds y rotation on horizontal faces", () => {
    expect(blockUvRotationAddition("north", rot)).toBe(180);
  });
});

describe("effectiveFaceRotation", () => {
  it("combines face and model rotation when uvlock is off", () => {
    const result = effectiveFaceRotation(face([0, 0, 16, 16], 90), {
      x: 0,
      y: 90,
      z: 0,
      uvlock: false,
    });
    expect(result).toBe(180);
  });

  it("ignores model rotation when uvlock is on", () => {
    const result = effectiveFaceRotation(face([0, 0, 16, 16], 90), {
      x: 90,
      y: 90,
      z: 0,
      uvlock: true,
    });
    expect(result).toBe(90);
  });
});

describe("faceThreeUvs", () => {
  it("maps block UV space to Three.js coordinates", () => {
    const uvs = faceThreeUvs(face([0, 0, 16, 16]));
    expect(uvs[0]).toEqual([0, 0]);
    expect(uvs[2][0]).toBe(1);
  });

  it("rotates corners for 90° steps", () => {
    const base = faceThreeUvs(face([0, 0, 16, 16], 0));
    const rotated = faceThreeUvs(face([0, 0, 16, 16], 90));
    expect(rotated).not.toEqual(base);
  });
});

describe("hitUvToPixel", () => {
  it("maps normalized hit UV back to pixel coordinates", () => {
    const f = face([4, 4, 12, 12]);
    const [px, py] = hitUvToPixel(0.5, 0.5, f);
    expect(px).toBeGreaterThanOrEqual(4);
    expect(py).toBeGreaterThanOrEqual(4);
    expect(px).toBeLessThan(12);
    expect(py).toBeLessThan(12);
  });
});

describe("faceUvRegion", () => {
  it("scales UV box to texture pixel dimensions", () => {
    const region = faceUvRegion(face([0, 0, 16, 16]), 16, 16);
    expect(region).toEqual({ x: 0, y: 0, width: 16, height: 16 });
  });
});
