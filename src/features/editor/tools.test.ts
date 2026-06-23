import { describe, expect, it } from "vitest";

import { hexToRgba, linePixels, rgbaToHex } from "./tools";

describe("hexToRgba", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgba("#ff8040")).toEqual([255, 128, 64, 255]);
  });

  it("expands 3-digit hex", () => {
    expect(hexToRgba("#f80")).toEqual([255, 136, 0, 255]);
  });
});

describe("rgbaToHex", () => {
  it("formats rgb as hex", () => {
    expect(rgbaToHex([255, 128, 64, 255])).toBe("#ff8040");
  });
});

describe("linePixels", () => {
  it("returns endpoints for horizontal line", () => {
    const pts = linePixels(0, 0, 3, 0);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([3, 0]);
    expect(pts.length).toBe(4);
  });

  it("returns diagonal endpoints", () => {
    const pts = linePixels(0, 0, 2, 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([2, 2]);
  });
});
