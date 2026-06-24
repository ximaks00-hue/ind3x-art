import { beforeEach, describe, expect, it } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import { resetCatalogIconCache } from "./catalogIconCache";
import {
  resetCatalogIconPipeline,
  shouldBakeTier1,
  shouldUpgradeTo3d,
} from "./catalogIconPipeline";

function sampleEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: "minecraft:stone",
    namespace: "minecraft",
    displayName: "Stone",
    kind: "block",
    sourcePath: "assets/minecraft/blockstates/stone.json",
    resolveKind: "blockstate",
    category: "building",
    searchTokens: [],
    texturePaths: ["assets/minecraft/textures/block/stone.png"],
    iconKey: "minecraft:stone:",
    aliases: [],
    ...overrides,
  };
}

describe("catalogIconPipeline", () => {
  beforeEach(() => {
    resetCatalogIconCache();
    resetCatalogIconPipeline();
  });

  it("auto mode upgrades items to tier-2", () => {
    const item = sampleEntry({ kind: "item", id: "minecraft:stick" });
    expect(shouldUpgradeTo3d(item, "auto")).toBe(true);
    expect(shouldBakeTier1(item, "auto")).toBe(true);
  });

  it("auto mode keeps blocks on preview when texture exists", () => {
    const block = sampleEntry();
    expect(shouldUpgradeTo3d(block, "auto")).toBe(false);
    expect(shouldBakeTier1(block, "auto")).toBe(true);
  });

  it("auto mode upgrades texture-less entries to tier-2", () => {
    const entry = sampleEntry({ texturePaths: [] });
    expect(shouldUpgradeTo3d(entry, "auto")).toBe(true);
    expect(shouldBakeTier1(entry, "auto")).toBe(false);
  });

  it("preview mode never upgrades to tier-2", () => {
    expect(shouldUpgradeTo3d(sampleEntry({ kind: "item" }), "preview")).toBe(false);
    expect(shouldBakeTier1(sampleEntry(), "preview")).toBe(true);
  });

  it("3d mode skips tier-1 and always upgrades", () => {
    expect(shouldUpgradeTo3d(sampleEntry(), "3d")).toBe(true);
    expect(shouldBakeTier1(sampleEntry(), "3d")).toBe(false);
  });
});
