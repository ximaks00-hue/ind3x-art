/**
 * Shared IPC types — canonical definitions kept here for runtime use.
 * Specta-generated types live in ./generated.ts; run `npm run gen:types` to regenerate.
 * Types here supersede generated.ts until we fully migrate (generated.ts has no runtime imports).
 */

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  target: string;
  profile: string;
  logDir?: string;
}

export type AssetKind =
  | "texture"
  | "textureMeta"
  | "blockModel"
  | "itemModel"
  | "blockstate"
  | "packMeta"
  | "lang"
  | "sound"
  | "other";

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  namespace: string;
  path: string;
  displayName: string;
}

export interface ProjectHandle {
  id: number;
}

export type SourceKind = "jar" | "folder";

export interface OpenSourceResult {
  handle: ProjectHandle;
  sourcePath: string;
  sourceKind: SourceKind;
  entryCount: number;
  fromCache: boolean;
  packFormat?: number;
}

export interface AssetFilter {
  kind?: AssetKind;
  namespace?: string;
  search?: string;
  fuzzy?: boolean;
}

export interface FacetCount {
  key: string;
  count: number;
}

export interface AssetFacets {
  byKind: FacetCount[];
  byNamespace: FacetCount[];
}

export interface TexturePreview {
  width: number;
  height: number;
  pngBase64: string;
}

export interface PageReq {
  offset: number;
  limit: number;
}

export interface AssetPage {
  entries: AssetEntry[];
  total: number;
}

export type IndexEvent =
  | { type: "started"; total: number }
  | { type: "progress"; scanned: number; total: number; stage: string }
  | { type: "asset"; entry: AssetEntry }
  | { type: "warning"; path: string; reason: string }
  | { type: "done"; durationMs: number; fromCache: boolean };

export interface CoreErrorPayload {
  code: string;
  message: string;
}

export type RenderableKind = "block" | "itemGenerated" | "itemModel" | "multipart";

export interface ElementRotation {
  origin: [number, number, number];
  axis: string;
  angle: number;
  rescale: boolean;
}

export interface RenderFace {
  direction: string;
  uv: [number, number, number, number];
  texture: string;
  rotation: number;
  tintindex: number;
  cullface?: string;
}

export interface RenderCuboid {
  from: [number, number, number];
  to: [number, number, number];
  rotation?: ElementRotation;
  faces: RenderFace[];
  shade: boolean;
}

export interface ModelRotation {
  x: number;
  y: number;
  z: number;
  uvlock: boolean;
}

export interface TextureAnimationMeta {
  frametime: number;
  interpolate: boolean;
  frameWidth: number;
  frameHeight: number;
  frames: number[];
}

export interface TextureMetaInfo {
  width: number;
  height: number;
  animation?: TextureAnimationMeta;
}

export interface DisplayTransform {
  rotation: [number, number, number];
  translation: [number, number, number];
  scale: [number, number, number];
}

export interface RenderableModel {
  kind: RenderableKind;
  cuboids: RenderCuboid[];
  textureRefs: Record<string, string>;
  textureMeta: Record<string, TextureMetaInfo>;
  modelRotation: ModelRotation;
  display: Record<string, DisplayTransform>;
  ambientOcclusion: boolean;
  modelId: string;
}

export interface VariantKey {
  key: string;
  model: string;
  x: number;
  y: number;
  z: number;
  uvlock: boolean;
}

export interface ModelRefInfo {
  modelId: string;
  path: string;
  kind: string;
  label: string;
}

export interface TextureSaveEntry {
  path: string;
  pngBase64: string;
  targetPath?: string;
}

export type SaveMode = "overwrite" | "exportFolder" | "rename" | "namespace";

export interface SaveOptions {
  mode: SaveMode;
  targetPath?: string;
  namespace?: string;
}

export interface SaveJournalEntry {
  timestamp: number;
  mode: SaveMode;
  originalPaths: string[];
  savedPaths: string[];
  backupPath?: string;
}

export interface BackupInfo {
  /** Stable opaque identifier (SHA-256 hex prefix of path). */
  id: string;
  path: string;
  createdAt: number;
  label: string;
  kind: string;
}

export interface SaveTexturesResult {
  savedCount: number;
  savedPaths: string[];
  originalPaths: string[];
  backupPath?: string;
}

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
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
