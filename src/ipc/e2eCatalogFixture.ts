import type { CatalogCategory, CatalogEntry } from "../ipc/types";

/** UC-4 scale fixture — 2400 synthetic catalog entries for mock E2E. */
export const E2E_CATALOG_SIZE = 2_400;

const CATEGORIES: CatalogCategory[] = [
  "building",
  "nature",
  "redstone",
  "decoration",
  "tools",
  "food",
  "misc",
];

function categoryForIndex(i: number): CatalogCategory {
  return CATEGORIES[i % CATEGORIES.length]!;
}

export function buildSyntheticCatalogEntry(index: number): CatalogEntry {
  if (index === 0) {
    return {
      id: "minecraft:test_stone",
      namespace: "minecraft",
      displayName: "Test Stone",
      kind: "block",
      sourcePath: "assets/minecraft/blockstates/test_stone.json",
      resolveKind: "blockstate",
      defaultVariantKey: "",
      category: "building",
      searchTokens: ["test stone", "minecraft:test_stone"],
      texturePaths: ["assets/minecraft/textures/block/test_stone.png"],
      iconKey: "minecraft:test_stone:",
      aliases: [],
    };
  }

  const stem = `block_${index}`;
  const category = categoryForIndex(index);
  const hasTexture = index % 17 !== 0;
  return {
    id: `minecraft:${stem}`,
    namespace: "minecraft",
    displayName: `Block ${index}`,
    kind: index % 11 === 0 ? "item" : "block",
    sourcePath: `assets/minecraft/blockstates/${stem}.json`,
    resolveKind: "blockstate",
    defaultVariantKey: "",
    category,
    searchTokens: [stem, `block ${index}`, `minecraft:${stem}`],
    texturePaths: hasTexture ? [`assets/minecraft/textures/block/${stem}.png`] : [],
    iconKey: `minecraft:${stem}:`,
    aliases: [],
  };
}

export function buildSyntheticCatalog(size = E2E_CATALOG_SIZE): CatalogEntry[] {
  return Array.from({ length: size }, (_, i) => buildSyntheticCatalogEntry(i));
}
