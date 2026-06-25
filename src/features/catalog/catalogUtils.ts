import type { AssetEntry, CatalogCategory, CatalogEntry } from "../../ipc/types";
import { getDirtyTexturePaths } from "../editor/documentStore";

export const CATALOG_GRID_COLS = 9;
/** Fixed catalog panel width — inner grid uses fr units to absorb scrollbar width. */
export const CATALOG_PANEL_WIDTH = 416;
export const CATALOG_CELL_SIZE = 40;
export const CATALOG_ROW_GAP = 4;
export const CATALOG_LABEL_EXTRA = 14;

export function catalogRowHeight(showLabels: boolean): number {
  return CATALOG_CELL_SIZE + CATALOG_ROW_GAP + (showLabels ? CATALOG_LABEL_EXTRA : 0);
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "building",
  "decoration",
  "redstone",
  "nature",
  "tools",
  "food",
  "misc",
];

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  building: "Building Blocks",
  decoration: "Decoration",
  redstone: "Redstone",
  nature: "Nature",
  tools: "Tools & Weapons",
  food: "Food",
  misc: "Misc",
};

export function catalogCategoryCount(
  facets: { byCategory: { key: string; count: number }[] } | null,
  category: CatalogCategory,
): number {
  return facets?.byCategory.find((facet) => facet.key === category)?.count ?? 0;
}

export function catalogTotalCount(
  facets: { byCategory: { key: string; count: number }[] } | null,
): number {
  return facets?.byCategory.reduce((sum, facet) => sum + facet.count, 0) ?? 0;
}

/** Map catalog entry to asset entry for viewer / resolve_renderable. */
export function catalogEntryToAssetEntry(entry: CatalogEntry): AssetEntry {
  const assetPath = entry.studioModelPath || entry.sourcePath;
  let kind: AssetEntry["kind"];
  if (entry.resolveKind === "blockstate") {
    kind = "blockstate";
  } else if (entry.kind === "item") {
    kind = "itemModel";
  } else {
    kind = "blockModel";
  }
  return {
    id: `${entry.namespace}:${assetPath}`,
    kind,
    namespace: entry.namespace,
    path: assetPath,
    displayName: entry.displayName,
    linkedModelCount: null,
  };
}

/** Find a classic explorer asset row matching a catalog entry's model path. */
export function findExplorerAssetForCatalog(
  entry: CatalogEntry,
  assets: AssetEntry[],
): AssetEntry | undefined {
  const path = entry.studioModelPath || entry.sourcePath;
  return assets.find((asset) => asset.path === path);
}

/** Map catalog variant_keys to viewer variant picker rows (keys only — use listVariants for model paths). */
export function catalogVariantKeysToPicker(
  keys: string[] | undefined,
): import("../../ipc/types").VariantKey[] {
  return (keys ?? []).map((key) => ({
    key,
    model: "",
    x: 0,
    y: 0,
    z: 0,
    uvlock: false,
    weight: null,
  }));
}

export function variantPickerLabel(variant: import("../../ipc/types").VariantKey): string {
  const label = variant.key || "(default)";
  const weight = variant.weight ? ` (w${variant.weight})` : "";
  const model = variant.model ? ` — ${variant.model}` : "";
  return `${label}${weight}${model}`;
}

export function catalogRowCount(entryCount: number): number {
  return Math.ceil(entryCount / CATALOG_GRID_COLS);
}

export function catalogCellIndex(row: number, col: number): number {
  return row * CATALOG_GRID_COLS + col;
}

/** Heuristic warnings for catalog cells (missing textures, model-only entries, icon bake). */
export function getCatalogEntryWarnings(
  entry: CatalogEntry,
  iconBakeError?: string | null,
): string[] {
  const warnings: string[] = [];
  if (iconBakeError) {
    warnings.push(iconBakeError);
  }
  if (entry.texturePaths.length === 0 && !iconBakeError) {
    warnings.push("No linked texture — icon uses 3D bake or placeholder");
  }
  if (entry.resolveKind === "model" && entry.kind === "block") {
    warnings.push("Block model without blockstate — variant picker unavailable");
  }
  return warnings;
}

export function catalogEntryIsDirty(entry: CatalogEntry): boolean {
  const dirtyPaths = new Set(getDirtyTexturePaths());
  return entry.texturePaths.some((path) => dirtyPaths.has(path));
}

export function catalogEntryHasWarnings(
  entry: CatalogEntry,
  iconBakeError?: string | null,
): boolean {
  return getCatalogEntryWarnings(entry, iconBakeError).length > 0;
}
