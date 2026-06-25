use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub target: String,
    pub profile: String,
    pub log_dir: Option<String>,
    /// True when sled could not open the on-disk cache (e.g. second app instance).
    pub cache_ephemeral: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LogTailResponse {
    pub log_dir: Option<String>,
    pub file: Option<String>,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AssetKind {
    Texture,
    TextureMeta,
    BlockModel,
    ItemModel,
    Blockstate,
    PackMeta,
    Lang,
    Sound,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetEntry {
    pub id: String,
    pub kind: AssetKind,
    pub namespace: String,
    /// Path inside the source (zip entry or relative file path), forward slashes.
    pub path: String,
    pub display_name: String,
    /// Number of models referencing this texture (textures only).
    #[serde(default)]
    pub linked_model_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHandle {
    pub id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReindexResult {
    pub asset_count: u64,
    pub catalog_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenSourceResult {
    pub handle: ProjectHandle,
    pub source_path: String,
    pub source_kind: SourceKind,
    pub entry_count: u64,
    pub from_cache: bool,
    #[serde(rename = "catalogFromCache")]
    pub catalog_from_cache: bool,
    #[serde(rename = "catalogEntryCount")]
    pub catalog_entry_count: u64,
    pub pack_format: Option<u32>,
    #[serde(rename = "catalogLanguage")]
    pub catalog_language: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    Jar,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetFilter {
    pub kind: Option<AssetKind>,
    pub namespace: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub fuzzy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FacetCount {
    pub key: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetFacets {
    pub by_kind: Vec<FacetCount>,
    pub by_namespace: Vec<FacetCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TexturePreview {
    pub width: u32,
    pub height: u32,
    pub png_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PageReq {
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetPage {
    pub entries: Vec<AssetEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub path: String,
    pub children: Vec<RelationshipNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetails {
    pub id: String,
    pub kind: AssetKind,
    pub path: String,
    pub namespace: String,
    pub display_name: String,
    pub pack_format: Option<u32>,
    pub texture_width: Option<u32>,
    pub texture_height: Option<u32>,
    pub linked_models: Vec<ModelRefInfo>,
    pub relationships: Vec<RelationshipNode>,
    pub warnings: Vec<AssetWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TexturePreviewBatch {
    pub path: String,
    pub preview: Option<TexturePreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum IndexEvent {
    Started { total: u64 },
    Progress {
        scanned: u64,
        total: u64,
        stage: String,
    },
    Asset { entry: AssetEntry },
    Warning { path: String, reason: String },
    Done {
        #[serde(rename = "durationMs")]
        duration_ms: u64,
        #[serde(rename = "fromCache")]
        from_cache: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RenderableKind {
    Block,
    ItemGenerated,
    ItemModel,
    Multipart,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelRotation {
    pub x: i16,
    pub y: i16,
    pub z: i16,
    pub uvlock: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ElementRotation {
    pub origin: [f32; 3],
    pub axis: String,
    pub angle: f32,
    pub rescale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderFace {
    pub direction: String,
    pub uv: [f32; 4],
    pub texture: String,
    pub rotation: u16,
    pub tintindex: i32,
    pub cullface: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderCuboid {
    pub from: [f32; 3],
    pub to: [f32; 3],
    pub rotation: Option<ElementRotation>,
    pub faces: Vec<RenderFace>,
    pub shade: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextureAnimationMeta {
    pub frametime: u32,
    pub interpolate: bool,
    pub frame_width: u32,
    pub frame_height: u32,
    pub frames: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextureMetaInfo {
    pub width: u32,
    pub height: u32,
    pub animation: Option<TextureAnimationMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DisplayTransform {
    pub rotation: [f32; 3],
    pub translation: [f32; 3],
    pub scale: [f32; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderableModel {
    pub kind: RenderableKind,
    pub cuboids: Vec<RenderCuboid>,
    pub texture_refs: std::collections::HashMap<String, String>,
    pub texture_meta: std::collections::HashMap<String, TextureMetaInfo>,
    pub model_rotation: ModelRotation,
    pub display: std::collections::HashMap<String, DisplayTransform>,
    pub ambient_occlusion: bool,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VariantKey {
    pub key: String,
    pub model: String,
    pub x: i16,
    pub y: i16,
    pub z: i16,
    pub uvlock: bool,
    #[serde(default)]
    pub weight: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModelRefInfo {
    pub model_id: String,
    pub path: String,
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextureSaveEntry {
    pub path: String,
    pub png_base64: String,
    #[serde(default)]
    pub target_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Type)]
#[serde(rename_all = "camelCase")]
pub enum SaveMode {
    Overwrite,
    ExportFolder,
    Rename,
    Namespace,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    pub mode: SaveMode,
    #[serde(default)]
    pub target_path: Option<String>,
    #[serde(default)]
    pub namespace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveJournalEntry {
    pub timestamp: u64,
    pub mode: SaveMode,
    pub original_paths: Vec<String>,
    pub saved_paths: Vec<String>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    /// Stable opaque identifier derived from the backup path (SHA-256 hex prefix).
    pub id: String,
    pub path: String,
    pub created_at: u64,
    pub label: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveTexturesResult {
    pub saved_count: u64,
    pub saved_paths: Vec<String>,
    pub original_paths: Vec<String>,
    pub backup_path: Option<String>,
}

// --- Block Studio catalog (Phase 0 API) ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CatalogEntryKind {
    Block,
    Item,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CatalogCategory {
    Building,
    Nature,
    Redstone,
    Decoration,
    Tools,
    Food,
    Misc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CatalogResolveKind {
    Blockstate,
    Model,
    Texture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CatalogPresentation {
    Block,
    Item,
    Tool,
    Food,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum StudioResolveContext {
    Icon,
    /// World-placed block model (no item display transform).
    Placed,
    /// @deprecated alias for `Placed`
    Studio,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    /// Stable id, e.g. `minecraft:stone`
    pub id: String,
    pub namespace: String,
    pub display_name: String,
    pub kind: CatalogEntryKind,
    /// blockstate path or item/block model path (legacy; prefer studio_model_path)
    pub source_path: String,
    pub resolve_kind: CatalogResolveKind,
    #[serde(default)]
    pub default_variant_key: Option<String>,
    pub category: CatalogCategory,
    pub search_tokens: Vec<String>,
    pub texture_paths: Vec<String>,
    pub icon_key: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    /// `minecraft:stone` when this entry represents a block
    #[serde(default)]
    pub block_id: Option<String>,
    /// `minecraft:diamond_sword` when this entry represents an item
    #[serde(default)]
    pub item_id: Option<String>,
    /// Asset path used for inventory icon resolve
    #[serde(default)]
    pub icon_model_path: Option<String>,
    /// Asset path used for 3D studio viewport
    pub studio_model_path: String,
    /// All blockstate variant keys for UI picker
    #[serde(default)]
    pub variant_keys: Vec<String>,
    pub presentation: CatalogPresentation,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogIconCacheBatch {
    pub icon_key: String,
    pub png_base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFilter {
    pub category: Option<CatalogCategory>,
    pub namespace: Option<String>,
    pub search: Option<String>,
    #[serde(default)]
    pub fuzzy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
    pub entries: Vec<CatalogEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFacets {
    pub by_category: Vec<FacetCount>,
}
