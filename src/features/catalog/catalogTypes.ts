/**
 * Block Studio catalog types — mirrors Rust DTOs (see `npm run gen:types`).
 * Phase 0: manual sync until bindings are regenerated.
 */

export type CatalogEntryKind = "block" | "item";

export type CatalogCategory =
  | "building"
  | "nature"
  | "redstone"
  | "decoration"
  | "tools"
  | "food"
  | "misc";

export type CatalogResolveKind = "blockstate" | "model";

export interface CatalogEntry {
  id: string;
  namespace: string;
  displayName: string;
  kind: CatalogEntryKind;
  sourcePath: string;
  resolveKind: CatalogResolveKind;
  defaultVariantKey?: string;
  category: CatalogCategory;
  searchTokens: string[];
  texturePaths: string[];
  iconKey: string;
  aliases?: string[];
}

export interface CatalogFilter {
  category?: CatalogCategory | null;
  namespace?: string | null;
  search?: string | null;
  fuzzy?: boolean;
}

export interface CatalogPage {
  entries: CatalogEntry[];
  total: number;
}

export type CatalogIconMode = "auto" | "preview" | "3d";

export interface CatalogFacets {
  byCategory: { key: string; count: number }[];
}
