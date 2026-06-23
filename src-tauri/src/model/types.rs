use std::collections::HashMap;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct RawModel {
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default, rename = "ambientocclusion")]
    pub ambient_occlusion: Option<bool>,
    #[serde(default)]
    pub textures: HashMap<String, String>,
    #[serde(default)]
    pub elements: Option<Vec<RawElement>>,
    #[serde(default)]
    pub display: HashMap<String, RawDisplay>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawElement {
    pub from: [f64; 3],
    pub to: [f64; 3],
    #[serde(default)]
    pub rotation: Option<RawElementRotation>,
    #[serde(default)]
    pub shade: Option<bool>,
    #[serde(default)]
    pub faces: HashMap<String, RawFace>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawElementRotation {
    pub origin: [f64; 3],
    pub axis: String,
    pub angle: f64,
    #[serde(default)]
    pub rescale: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawFace {
    #[serde(default)]
    pub uv: Option<[f64; 4]>,
    pub texture: String,
    #[serde(default)]
    pub cullface: Option<String>,
    #[serde(default)]
    pub rotation: Option<i32>,
    #[serde(default)]
    pub tintindex: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawDisplay {
    #[serde(default)]
    pub rotation: [f64; 3],
    #[serde(default)]
    pub translation: [f64; 3],
    #[serde(default)]
    pub scale: [f64; 3],
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum VariantValue {
    Single(RawVariantModel),
    Multiple(Vec<RawVariantModel>),
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawVariantModel {
    pub model: String,
    #[serde(default)]
    pub x: i16,
    #[serde(default)]
    pub y: i16,
    #[serde(default)]
    pub z: i16,
    #[serde(default)]
    pub uvlock: bool,
    #[serde(default)]
    pub weight: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawMultipart {
    #[serde(default)]
    pub when: Option<serde_json::Value>,
    pub apply: MultipartApply,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum MultipartApply {
    Single(RawVariantModel),
    Multiple(Vec<RawVariantModel>),
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawBlockstate {
    #[serde(default)]
    pub variants: HashMap<String, VariantValue>,
    #[serde(default)]
    pub multipart: Option<Vec<RawMultipart>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawMcMeta {
    #[serde(default)]
    pub animation: Option<RawAnimation>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawAnimation {
    #[serde(default)]
    pub frametime: u32,
    #[serde(default)]
    pub interpolate: bool,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub frames: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct ResolvedModel {
    pub model_id: String,
    #[allow(dead_code)]
    pub parent_chain: Vec<String>,
    pub ambient_occlusion: bool,
    pub textures: HashMap<String, String>,
    pub elements: Vec<RawElement>,
    pub display: HashMap<String, RawDisplay>,
    pub is_item_generated: bool,
}

impl ResolvedModel {
    pub fn texture_paths(&self, namespace: &str) -> Vec<String> {
        let mut paths = Vec::new();
        for value in self.textures.values() {
            if let Some(path) = resolve_texture_value(value, namespace, &self.textures) {
                paths.push(path);
            }
        }
        for element in &self.elements {
            for face in element.faces.values() {
                if let Some(path) =
                    resolve_texture_value(&face.texture, namespace, &self.textures)
                {
                    paths.push(path);
                }
            }
        }
        paths.sort();
        paths.dedup();
        paths
    }

    pub fn references_texture(&self, namespace: &str, texture_stem: &str) -> bool {
        self.texture_paths(namespace)
            .iter()
            .any(|p| texture_stem_from_assets_path(p) == texture_stem)
    }
}

pub fn texture_stem_from_assets_path(path: &str) -> String {
    let path = path
        .strip_prefix("assets/")
        .unwrap_or(path);
    let parts: Vec<&str> = path.splitn(3, '/').collect();
    if parts.len() == 3 && parts[1] == "textures" {
        parts[2]
            .strip_suffix(".png")
            .unwrap_or(parts[2])
            .to_string()
    } else {
        path.to_string()
    }
}

pub fn texture_stem_from_entry_path(path: &str) -> String {
    let path = path
        .strip_prefix("assets/")
        .unwrap_or(path);
    let parts: Vec<&str> = path.splitn(3, '/').collect();
    if parts.len() == 3 {
        parts[2]
            .strip_suffix(".png")
            .unwrap_or(parts[2])
            .to_string()
    } else {
        path.to_string()
    }
}

pub fn resolve_texture_value(
    value: &str,
    namespace: &str,
    textures: &HashMap<String, String>,
) -> Option<String> {
    resolve_texture_value_with_pack(value, namespace, textures, &crate::model::normalize::PackInfo::default())
}

pub fn resolve_texture_value_with_pack(
    value: &str,
    namespace: &str,
    textures: &HashMap<String, String>,
    pack: &crate::model::normalize::PackInfo,
) -> Option<String> {
    if let Some(key) = value.strip_prefix('#') {
        let next = textures.get(key)?;
        return resolve_texture_value_with_pack(next, namespace, textures, pack);
    }

    let normalized = crate::model::normalize::normalize_texture_ref(value, pack);
    if let Some((ns, path)) = normalized.split_once(':') {
        return Some(format!("assets/{ns}/textures/{path}.png"));
    }
    Some(format!(
        "assets/{namespace}/textures/{normalized}.png"
    ))
}

pub fn model_id_from_asset_path(path: &str) -> Option<(String, String)> {
    // assets/<ns>/models/block/foo.json -> (ns, block/foo)
    let path = path.strip_prefix("assets/")?;
    let mut parts = path.splitn(4, '/');
    let namespace = parts.next()?.to_string();
    if parts.next()? != "models" {
        return None;
    }
    let rel = parts.next()?.to_string();
    let rel = rel.strip_suffix(".json")?.to_string();
    Some((namespace, rel))
}

pub fn blockstate_id_from_asset_path(path: &str) -> Option<(String, String)> {
    let path = path.strip_prefix("assets/")?;
    let mut parts = path.splitn(4, '/');
    let namespace = parts.next()?.to_string();
    if parts.next()? != "blockstates" {
        return None;
    }
    let rel = parts.next()?.to_string();
    let rel = rel.strip_suffix(".json")?.to_string();
    Some((namespace, rel))
}

pub fn normalize_model_ref(model_ref: &str, default_namespace: &str) -> (String, String) {
    if let Some((ns, path)) = model_ref.split_once(':') {
        (ns.to_string(), path.to_string())
    } else {
        (default_namespace.to_string(), model_ref.to_string())
    }
}