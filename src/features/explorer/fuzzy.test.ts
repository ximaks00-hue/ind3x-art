import { describe, expect, it } from "vitest";

import { fuzzyScore, filterAssetsFuzzy } from "./fuzzy";

describe("fuzzyScore", () => {
  it("returns null for empty query", () => {
    expect(fuzzyScore("", "stone")).toBeNull();
    expect(fuzzyScore("  ", "stone")).toBeNull();
  });

  it("prefers substring matches", () => {
    expect(fuzzyScore("stone", "assets/minecraft/textures/block/stone.png")).toBe(995);
  });

  it("matches subsequence", () => {
    expect(fuzzyScore("stn", "stone")).not.toBeNull();
    expect(fuzzyScore("xyz", "stone")).toBeNull();
  });
});

describe("filterAssetsFuzzy", () => {
  const assets = [
    {
      displayName: "stone_brick",
      path: "assets/minecraft/textures/block/stone_brick.png",
      namespace: "minecraft",
    },
    {
      displayName: "grass",
      path: "assets/minecraft/textures/block/grass.png",
      namespace: "minecraft",
    },
  ];

  it("returns all assets for empty query", () => {
    expect(filterAssetsFuzzy(assets, "", true)).toEqual(assets);
  });

  it("filters with substring mode", () => {
    const result = filterAssetsFuzzy(assets, "grass", false);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("grass");
  });

  it("filters with fuzzy mode", () => {
    const result = filterAssetsFuzzy(assets, "sbrk", true);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("stone_brick");
  });
});
