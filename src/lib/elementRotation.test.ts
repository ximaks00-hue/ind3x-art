import { describe, expect, it } from "vitest";

import { elementRescaleFactor } from "./elementRotation";

describe("elementRescaleFactor", () => {
  it("returns 1 when rescale is disabled", () => {
    expect(elementRescaleFactor(45, false)).toBe(1);
    expect(elementRescaleFactor(0, true)).toBe(1);
  });

  it("matches vanilla 1/cos(angle) for common rotations", () => {
    expect(elementRescaleFactor(45, true)).toBeCloseTo(1 / Math.cos(Math.PI / 4), 6);
    expect(elementRescaleFactor(22.5, true)).toBeCloseTo(
      1 / Math.cos((22.5 * Math.PI) / 180),
      6,
    );
    expect(elementRescaleFactor(-45, true)).toBeCloseTo(1 / Math.cos(-Math.PI / 4), 6);
  });

  it("scales up for non-zero angles (trapdoor-style rescale)", () => {
    const factor = elementRescaleFactor(45, true);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeCloseTo(Math.SQRT2, 3);
  });
});
