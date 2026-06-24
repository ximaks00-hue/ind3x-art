import { describe, expect, it } from "vitest";

import { buildMoveSelectionChanges, type MoveBuffer } from "./moveSelection";
import type { Rgba } from "./textureDocument";

describe("moveSelection", () => {
  it("consolidates overlap updates into stable undo-safe changes", () => {
    const layer = new Map<string, Rgba>();
    layer.set("0,0", [10, 0, 0, 255]);
    layer.set("1,0", [20, 0, 0, 255]);

    const buffer: MoveBuffer = {
      x0: 0,
      y0: 0,
      w: 2,
      h: 1,
      pixels: new Map([
        ["0,0", [10, 0, 0, 255]],
        ["1,0", [20, 0, 0, 255]],
      ]),
    };

    const changes = buildMoveSelectionChanges("layer-1", buffer, 1, 0, (x, y) =>
      layer.get(`${x},${y}`) ?? null,
    );

    // Overlap move by +1 should produce three effective mutations:
    // (0,0) cleared, (1,0) replaced with previous left pixel, (2,0) newly written.
    expect(changes).toHaveLength(3);
    const byPoint = new Map(changes.map((c) => [`${c.x},${c.y}`, c]));
    expect(byPoint.get("0,0")?.before).toEqual([10, 0, 0, 255]);
    expect(byPoint.get("0,0")?.after).toEqual([0, 0, 0, 0]);
    expect(byPoint.get("1,0")?.before).toEqual([20, 0, 0, 255]);
    expect(byPoint.get("1,0")?.after).toEqual([10, 0, 0, 255]);
    expect(byPoint.get("2,0")?.before).toEqual([0, 0, 0, 0]);
    expect(byPoint.get("2,0")?.after).toEqual([20, 0, 0, 255]);
  });
});
