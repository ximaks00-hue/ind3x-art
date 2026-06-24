import { beforeEach, describe, expect, it } from "vitest";

import { useCatalogStore } from "./catalogStore";
import {
  catalogCellIndex,
  catalogEntryHasWarnings,
  catalogEntryToAssetEntry,
  catalogRowCount,
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
    };
    expect(getCatalogEntryWarnings(entry)).toHaveLength(2);
    expect(catalogEntryHasWarnings(entry)).toBe(true);
  });
});

describe("catalogStore", () => {
  beforeEach(() => {
    useCatalogStore.getState().reset();
  });

  it("merges paginated entries without duplicates", () => {
    const entry = {
      id: "minecraft:stone",
      namespace: "minecraft",
      displayName: "Stone",
      kind: "block" as const,
      sourcePath: "assets/minecraft/blockstates/stone.json",
      resolveKind: "blockstate" as const,
      category: "building" as const,
      searchTokens: [],
      texturePaths: [],
      iconKey: "minecraft:stone:",
      aliases: [],
    };
    const dirt = {
      ...entry,
      id: "minecraft:dirt",
      displayName: "Dirt",
      sourcePath: "assets/minecraft/blockstates/dirt.json",
      iconKey: "minecraft:dirt:",
    };
    useCatalogStore.getState().setQueryPage([entry], 2, false, 0);
    useCatalogStore.getState().setQueryPage([dirt], 2, true, 1);
    expect(useCatalogStore.getState().entries).toHaveLength(2);
    expect(useCatalogStore.getState().hasMore).toBe(false);
  });
});
