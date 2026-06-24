/**
 * Block Studio catalog types — mirrors Rust DTOs (see `npm run gen:types`).
 */

export type {
  CatalogCategory,
  CatalogEntry,
  CatalogEntryKind,
  CatalogFacets,
  CatalogFilter,
  CatalogPage,
  CatalogPresentation,
  CatalogResolveKind,
  StudioResolveContext,
} from "../../ipc/types";

export type CatalogIconMode = "auto" | "preview" | "3d";
