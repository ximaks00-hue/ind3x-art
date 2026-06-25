import { beforeEach, describe, expect, it } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import { resetCatalogIconCache } from "./catalogIconCache";
import {
  resetCatalogIconPipeline,
  shouldBakeTier1,
  shouldUpgradeTo3d,
} from "./catalogIconPipeline";

function sampleEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  const sourcePath = "assets/minecraft/blockstates/stone.json";
  return {
    id: "minecraft:stone",
    namespace: "minecraft",
    displayName: "Stone",
    kind: "block",
    sourcePath,
    resolveKind: "blockstate",
    category: "building",
    searchTokens: [],
    texturePaths: ["assets/minecraft/textures/block/stone.png"],
    iconKey: "minecraft:stone:",
    aliases: [],
    studioModelPath: sourcePath,
    presentation: "block",
    ...overrides,
  };
}

describe("catalogIconPipeline", () => {
  beforeEach(() => {
    resetCatalogIconCache();
    resetCatalogIconPipeline();
  });

  it("auto mode upgrades only selected entries to tier-2 3D", () => {
    const block = sampleEntry();
    const item = sampleEntry({ kind: "item", id: "minecraft:stick" });
    expect(shouldUpgradeTo3d(block, "auto", "selected")).toBe(true);
    expect(shouldUpgradeTo3d(item, "auto", "selected")).toBe(true);
    expect(shouldUpgradeTo3d(block, "auto", "visible")).toBe(false);
    expect(shouldUpgradeTo3d(block, "auto", "prefetch")).toBe(false);
    expect(shouldBakeTier1(block, "auto", "visible")).toBe(true);
  });

  it("preview mode uses tier-1 only", () => {
    const block = sampleEntry();
    expect(shouldUpgradeTo3d(block, "preview")).toBe(false);
    expect(shouldBakeTier1(block, "preview")).toBe(true);
  });

  it("auto mode uses tier-1 for visible grid cells without textures", () => {
    const entry = sampleEntry({ texturePaths: [] });
    expect(shouldUpgradeTo3d(entry, "auto", "visible")).toBe(false);
    expect(shouldBakeTier1(entry, "auto", "visible")).toBe(true);
    expect(shouldUpgradeTo3d(entry, "auto", "selected")).toBe(true);
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
