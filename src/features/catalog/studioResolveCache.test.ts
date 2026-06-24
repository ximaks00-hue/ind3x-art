import { describe, expect, it } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import {
  clearStudioResolveCache,
  clearStudioResolveCacheForHandle,
  getStudioResolveCache,
  setStudioResolveCache,
  studioResolveKey,
} from "./studioResolveCache";

const stubModel = { kind: "block" } as RenderableModel;

describe("studioResolveCache", () => {
  it("stores and retrieves by handle+entry+variant", () => {
    clearStudioResolveCache();
    const key = studioResolveKey(1, "minecraft:stone", "");
    setStudioResolveCache(key, stubModel);
    expect(getStudioResolveCache(key)).toBe(stubModel);
  });

  it("evicts oldest entries beyond capacity", () => {
    clearStudioResolveCache();
    for (let i = 0; i < 70; i++) {
      setStudioResolveCache(studioResolveKey(1, `entry:${i}`, ""), stubModel);
    }
    expect(getStudioResolveCache(studioResolveKey(1, "entry:0", ""))).toBeUndefined();
    expect(getStudioResolveCache(studioResolveKey(1, "entry:69", ""))).toBe(stubModel);
  });

  it("clears entries for a single project handle", () => {
    clearStudioResolveCache();
    setStudioResolveCache(studioResolveKey(1, "minecraft:stone", ""), stubModel);
    setStudioResolveCache(studioResolveKey(2, "minecraft:dirt", ""), stubModel);
    clearStudioResolveCacheForHandle(1);
    expect(getStudioResolveCache(studioResolveKey(1, "minecraft:stone", ""))).toBeUndefined();
    expect(getStudioResolveCache(studioResolveKey(2, "minecraft:dirt", ""))).toBe(stubModel);
  });
});
