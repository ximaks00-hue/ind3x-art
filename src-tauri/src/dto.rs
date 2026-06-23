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
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectHandle {
    pub id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenSourceResult {
    pub handle: ProjectHandle,
    pub source_path: String,
    pub source_kind: SourceKind,
    pub entry_count: u64,
    pub from_cache: bool,
    pub pack_format: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
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
    Done { duration_ms: u64, from_cache: bool },
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
