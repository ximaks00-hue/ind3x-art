import { describe, expect, it } from "vitest";

import { miniSceneGhostOffsets } from "./miniSceneLayout";

describe("miniSceneGhostOffsets", () => {
  it("returns three ghosts for 2×2 around center", () => {
    expect(miniSceneGhostOffsets(2)).toEqual([
      [-1, 0, -1],
      [0, 0, -1],
      [-1, 0, 0],
    ]);
  });

  it("returns eight ghosts for 3×3 around center", () => {
    expect(miniSceneGhostOffsets(3)).toHaveLength(8);
    expect(miniSceneGhostOffsets(3)).not.toContainEqual([0, 0, 0]);
  });
});
