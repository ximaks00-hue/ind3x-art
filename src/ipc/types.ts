/**
 * IPC types — canonical re-exports from tauri-specta bindings.
 * Run `npm run gen:types` after changing Rust DTOs or commands.
 */

export type {
  AppInfo,
  AssetDetails,
  AssetEntry,
  AssetFacets,
  AssetFilter,
  AssetKind,
  AssetPage,
  AssetWarning,
  BackupInfo,
  CatalogCategory,
  CatalogEntry,
  CatalogEntryKind,
  CatalogFacets,
  CatalogFilter,
  CatalogPage,
  CatalogPresentation,
  CatalogResolveKind,
  CoreError,
  DisplayTransform,
  ElementRotation,
  FacetCount,
  IndexEvent,
  LogTailResponse,
  ModelRefInfo,
  ModelRotation,
  OpenSourceResult,
  ReindexResult,
  PageReq,
  ProjectHandle,
  RelationshipNode,
  RenderableKind,
  RenderableModel,
  RenderCuboid,
  RenderFace,
  SaveJournalEntry,
  SaveMode,
  SaveOptions,
  SaveTexturesResult,
  SourceKind,
  StudioResolveContext,
  TextureAnimationMeta,
  TextureMetaInfo,
  TexturePreview,
  TexturePreviewBatch,
  TextureSaveEntry,
  VariantKey,
} from "./bindings";

/** Serialized core error shape thrown by the IPC client wrapper. */
export interface CoreErrorPayload {
  code: string;
  message: string;
}

export const ASSET_KIND_LABELS: Record<import("./bindings").AssetKind, string> = {
  texture: "Texture",
  textureMeta: "Anim",
  blockModel: "Block Model",
  itemModel: "Item Model",
  blockstate: "Blockstate",
  packMeta: "Pack",
  lang: "Lang",
  sound: "Sound",
  other: "Other",
};
