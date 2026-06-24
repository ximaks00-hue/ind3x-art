import type { CatalogCategory, CatalogEntry } from "../ipc/types";

/** UC-4 scale fixture — 2400 synthetic catalog entries for mock E2E. */
export const E2E_CATALOG_SIZE = 2_400;

const CATEGORIES: CatalogCategory[] = [
  "building",
  "decoration",
  "redstone",
  "nature",
  "tools",
  "food",
  "misc",
];

function categoryForIndex(i: number): CatalogCategory {
  return CATEGORIES[i % CATEGORIES.length]!;
}

function syntheticStudioPath(index: number, kind: "block" | "item"): string {
  const stem = index === 0 ? "test_stone" : `block_${index}`;
  if (kind === "item") {
    return `assets/minecraft/models/item/${stem}.json`;
  }
  return `assets/minecraft/blockstates/${stem}.json`;
}

export function buildSyntheticCatalogEntry(index: number): CatalogEntry {
  const stem = index === 0 ? "test_stone" : `block_${index}`;
  const category = categoryForIndex(index);
  const kind = index % 11 === 0 ? "item" : "block";
  const studioPath = syntheticStudioPath(index, kind);
  const hasTexture = index % 17 !== 0;

  if (index === 1) {
    return {
      id: "minecraft:test_fence_variant",
      namespace: "minecraft",
      displayName: "Test Fence Variant",
      kind: "block",
      sourcePath: "assets/minecraft/blockstates/oak_fence.json",
      resolveKind: "blockstate",
      defaultVariantKey: "",
      category: "building",
      searchTokens: ["test fence variant", "minecraft:test_fence_variant"],
      texturePaths: ["assets/minecraft/textures/block/oak_fence.png"],
      iconKey: "minecraft:test_fence_variant:",
      aliases: [],
      blockId: "minecraft:oak_fence",
      itemId: null,
      iconModelPath: null,
      studioModelPath: "assets/minecraft/blockstates/oak_fence.json",
      variantKeys: ["", "east=true", "north=true"],
      presentation: "block",
    };
  }

  if (index === 2) {
    return {
      id: "minecraft:test_fence_multipart",
      namespace: "minecraft",
      displayName: "Test Fence Multipart",
      kind: "block",
      sourcePath: "assets/minecraft/blockstates/oak_fence.json",
      resolveKind: "blockstate",
      defaultVariantKey: "",
      category: "building",
      searchTokens: ["test fence multipart", "minecraft:test_fence_multipart"],
      texturePaths: [
        "assets/minecraft/textures/block/oak_fence_post.png",
        "assets/minecraft/textures/block/oak_fence.png",
      ],
      iconKey: "minecraft:test_fence_multipart:",
      aliases: [],
      blockId: "minecraft:oak_fence",
      itemId: null,
      iconModelPath: null,
      studioModelPath: "assets/minecraft/blockstates/oak_fence.json",
      variantKeys: [""],
      presentation: "block",
    };
  }

  if (index === 0) {
    return {
      id: "minecraft:test_stone",
      namespace: "minecraft",
      displayName: "Test Stone",
      kind: "block",
      sourcePath: studioPath,
      resolveKind: "blockstate",
      defaultVariantKey: "",
      category: "building",
      searchTokens: ["test stone", "minecraft:test_stone"],
      texturePaths: ["assets/minecraft/textures/block/test_stone.png"],
      iconKey: "minecraft:test_stone:",
      aliases: [],
      blockId: "minecraft:test_stone",
      itemId: "minecraft:test_stone",
      iconModelPath: "assets/minecraft/models/item/test_stone.json",
      studioModelPath: studioPath,
      variantKeys: [""],
      presentation: "block",
    };
  }

  return {
    id: `minecraft:${stem}`,
    namespace: "minecraft",
    displayName: `Block ${index}`,
    kind,
    sourcePath: studioPath,
    resolveKind: "blockstate",
    defaultVariantKey: "",
    category,
    searchTokens: [stem, `block ${index}`, `minecraft:${stem}`],
    texturePaths: hasTexture ? [`assets/minecraft/textures/block/${stem}.png`] : [],
    iconKey: `minecraft:${stem}:`,
    aliases: [],
    blockId: kind === "block" ? `minecraft:${stem}` : null,
    itemId: kind === "item" ? `minecraft:${stem}` : null,
    iconModelPath: kind === "item" ? studioPath : null,
    studioModelPath: studioPath,
    variantKeys: [""],
    presentation: kind === "item" ? "item" : "block",
  };
}

export function buildSyntheticCatalog(size = E2E_CATALOG_SIZE): CatalogEntry[] {
  return Array.from({ length: size }, (_, i) => buildSyntheticCatalogEntry(i));
}
