import { describe, expect, it } from "vitest";

import {
  catalogCellIndex,
  catalogCategoryCount,
  catalogEntryHasWarnings,
  catalogEntryToAssetEntry,
  catalogRowCount,
  catalogTotalCount,
  getCatalogEntryWarnings,
} from "./catalogUtils";

describe("catalogUtils", () => {
  it("maps blockstate catalog entry to asset entry", () => {
    const asset = catalogEntryToAssetEntry({
      id: "minecraft:test_stone",
      namespace: "minecraft",
      displayName: "Test Stone",
      kind: "block",
      sourcePath: "assets/minecraft/blockstates/test_stone.json",
      resolveKind: "blockstate",
      defaultVariantKey: "",
      category: "building",
      searchTokens: [],
      texturePaths: [],
      iconKey: "minecraft:test_stone:",
      aliases: [],
      studioModelPath: "assets/minecraft/blockstates/test_stone.json",
      presentation: "block",
    });
    expect(asset.kind).toBe("blockstate");
    expect(asset.id).toBe("minecraft:assets/minecraft/blockstates/test_stone.json");
    expect(asset.path).toBe("assets/minecraft/blockstates/test_stone.json");
  });

  it("computes grid row count", () => {
    expect(catalogRowCount(0)).toBe(0);
    expect(catalogRowCount(9)).toBe(1);
    expect(catalogRowCount(10)).toBe(2);
    expect(catalogRowCount(5000)).toBe(Math.ceil(5000 / 9));
    expect(catalogCellIndex(1, 0)).toBe(9);
  });

  it("flags entries missing texture paths", () => {
    const entry = {
      id: "minecraft:orphan",
      namespace: "minecraft",
      displayName: "Orphan",
      kind: "block" as const,
      sourcePath: "assets/minecraft/models/block/orphan.json",
      resolveKind: "model" as const,
      category: "misc" as const,
      searchTokens: [],
      texturePaths: [],
      iconKey: "minecraft:orphan:",
      aliases: [],
      studioModelPath: "assets/minecraft/models/block/orphan.json",
      presentation: "block" as const,
    };
    expect(getCatalogEntryWarnings(entry)).toHaveLength(2);
    expect(catalogEntryHasWarnings(entry)).toBe(true);
  });

  it("counts catalog categories from facets", () => {
    const facets = {
      byCategory: [
        { key: "building", count: 12 },
        { key: "food", count: 0 },
      ],
    };
    expect(catalogCategoryCount(facets, "building")).toBe(12);
    expect(catalogCategoryCount(facets, "food")).toBe(0);
    expect(catalogTotalCount(facets)).toBe(12);
  });
});
