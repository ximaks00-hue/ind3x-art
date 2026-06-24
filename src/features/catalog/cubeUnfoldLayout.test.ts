import { describe, expect, it } from "vitest";

import {
  CUBE_FACE_ORDER,
  CUBE_FACE_SLOTS,
  directionForUnfoldCell,
  isCubeFaceDirection,
} from "./cubeUnfoldLayout";

describe("cubeUnfoldLayout", () => {
  it("maps standard directions to cross net slots", () => {
    expect(CUBE_FACE_SLOTS.north).toEqual({ col: 1, row: 1 });
    expect(CUBE_FACE_SLOTS.up).toEqual({ col: 1, row: 0 });
    expect(CUBE_FACE_SLOTS.down).toEqual({ col: 1, row: 2 });
  });

  it("resolves direction from grid coordinates", () => {
    expect(directionForUnfoldCell(1, 1)).toBe("north");
    expect(directionForUnfoldCell(0, 0)).toBeNull();
  });

  it("recognizes cube face directions", () => {
    for (const direction of CUBE_FACE_ORDER) {
      expect(isCubeFaceDirection(direction)).toBe(true);
    }
    expect(isCubeFaceDirection("invalid")).toBe(false);
  });
});
