import type { AssetEntry, CatalogCategory, CatalogEntry } from "../../ipc/types";
import { getDirtyTexturePaths } from "../editor/documentStore";

export const CATALOG_GRID_COLS = 9;
export const CATALOG_CATEGORIES: CatalogCategory[] = [
  "building",
  "nature",
  "redstone",
  "decoration",
  "tools",
  "food",
  "misc",
];

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  building: "Building",
  nature: "Nature",
  redstone: "Redstone",
  decoration: "Decoration",
  tools: "Tools",
  food: "Food",
  misc: "Misc",
};

/** Map catalog entry to asset entry for viewer / resolve_renderable. */
export function catalogEntryToAssetEntry(entry: CatalogEntry): AssetEntry {
  let kind: AssetEntry["kind"];
  if (entry.resolveKind === "blockstate") {
    kind = "blockstate";
  } else if (entry.kind === "item") {
    kind = "itemModel";
  } else {
    kind = "blockModel";
  }
  return {
    id: `${entry.namespace}:${entry.sourcePath}`,
    kind,
    namespace: entry.namespace,
    path: entry.sourcePath,
    displayName: entry.displayName,
    linkedModelCount: null,
  };
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
