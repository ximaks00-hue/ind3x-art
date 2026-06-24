import { describe, expect, it } from "vitest";

import { floodFillAlgorithm, magicWandAlgorithm } from "./pixelAlgorithms";

function makeBuffer(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = fill[3];
  }
  return data;
}

// biome-ignore lint: vitest "pool" option not yet in @types/vitest
describe("pixelWorker algorithms", { pool: "forks" } as never, () => {
  it("floodFillAlgorithm returns sparse changes only", () => {
    const data = makeBuffer(4, 4, [255, 0, 0, 255]);
    const changes = floodFillAlgorithm({
      data,
      width: 4,
      height: 4,
      startX: 0,
      startY: 0,
      fillR: 0,
      fillG: 255,
      fillB: 0,
      fillA: 255,
      tolerance: 0,
    });

    expect(changes).toHaveLength(16);
    expect(changes[0]).toMatchObject({
      x: 0,
      y: 0,
      before: [255, 0, 0, 255],
      after: [0, 255, 0, 255],
    });
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(255);
  });

  it("floodFillAlgorithm returns empty when start is out of bounds", () => {
    const data = makeBuffer(2, 2, [0, 0, 0, 255]);
    expect(
      floodFillAlgorithm({
        data,
        width: 2,
        height: 2,
        startX: 5,
        startY: 0,
        fillR: 1,
        fillG: 1,
        fillB: 1,
        fillA: 255,
        tolerance: 0,
      }),
    ).toEqual([]);
  });

  it("magicWandAlgorithm returns bounding box for matching region", () => {
    const data = makeBuffer(4, 4, [0, 0, 0, 255]);
    data[5 * 4] = 255;
    data[5 * 4 + 1] = 0;
    data[5 * 4 + 2] = 0;
    data[6 * 4] = 255;

    const sel = magicWandAlgorithm({
      data,
      width: 4,
      height: 4,
      startX: 1,
      startY: 1,
      tolerance: 0,
    });

    expect(sel).toEqual([1, 1, 2, 1]);
  });
});
