use std::collections::{HashMap, HashSet};

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
    pub ambient_occlusion: bool,
    pub textures: HashMap<String, String>,
    pub elements: Vec<RawElement>,
    pub display: HashMap<String, RawDisplay>,
    pub is_item_generated: bool,
}

impl ResolvedModel {
    pub fn texture_paths(&self, namespace: &str, pack: &crate::model::normalize::PackInfo) -> Vec<String> {
        let mut paths = Vec::new();
        for value in self.textures.values() {
            if let Some(path) =
                resolve_texture_value_with_pack(value, namespace, &self.textures, pack)
            {
                paths.push(path);
            }
        }
        for element in &self.elements {
            for face in element.faces.values() {
                if let Some(path) =
                    resolve_texture_value_with_pack(&face.texture, namespace, &self.textures, pack)
                {
                    paths.push(path);
                }
            }
        }
        paths.sort();
        paths.dedup();
        paths
    }

    pub fn references_texture(
        &self,
        namespace: &str,
        texture_stem: &str,
        texture_asset_path: &str,
        pack: &crate::model::normalize::PackInfo,
    ) -> bool {
        let normalized_target = normalize_texture_asset_path(texture_asset_path);
        let normalized_stem = normalize_texture_stem(texture_stem);
        self.texture_paths(namespace, pack).iter().any(|p| {
            normalize_texture_asset_path(p) == normalized_target
                || normalize_texture_stem(&texture_stem_from_assets_path(p)) == normalized_stem
        }) || self.textures.values().any(|value| {
            if value.starts_with('#') {
                return false;
            }
            let stem = if let Some((_, path)) = value.split_once(':') {
                normalize_texture_stem(path)
            } else {
                normalize_texture_stem(value)
            };
            stem == normalized_stem
        })
    }
}

pub fn normalize_texture_stem(stem: &str) -> String {
    stem.strip_prefix("blocks/")
        .map(|rest| format!("block/{rest}"))
        .or_else(|| {
            stem.strip_prefix("items/")
                .map(|rest| format!("item/{rest}"))
        })
        .unwrap_or_else(|| stem.to_string())
}

pub fn normalize_texture_asset_path(path: &str) -> String {
    path.replace("/textures/blocks/", "/textures/block/")
        .replace("/textures/items/", "/textures/item/")
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

pub fn resolve_texture_value_with_pack(
    value: &str,
    namespace: &str,
    textures: &HashMap<String, String>,
    pack: &crate::model::normalize::PackInfo,
) -> Option<String> {
    resolve_texture_value_with_pack_inner(value, namespace, textures, pack, &mut HashSet::new())
}

fn resolve_texture_value_with_pack_inner(
    value: &str,
    namespace: &str,
    textures: &HashMap<String, String>,
    pack: &crate::model::normalize::PackInfo,
    visited: &mut HashSet<String>,
) -> Option<String> {
    if let Some(key) = value.strip_prefix('#') {
        if !visited.insert(key.to_string()) {
            return None;
        }
        let next = textures.get(key)?;
        return resolve_texture_value_with_pack_inner(next, namespace, textures, pack, visited);
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
    let mut parts = path.splitn(3, '/');
    let namespace = parts.next()?.to_string();
    if parts.next()? != "models" {
        return None;
    }
    let rel = parts.next()?.strip_suffix(".json")?.to_string();
    Some((namespace, rel))
}

pub fn blockstate_id_from_asset_path(path: &str) -> Option<(String, String)> {
    let path = path.strip_prefix("assets/")?;
    let mut parts = path.splitn(3, '/');
    let namespace = parts.next()?.to_string();
    if parts.next()? != "blockstates" {
        return None;
    }
    let rel = parts.next()?.strip_suffix(".json")?.to_string();
    Some((namespace, rel))
}

pub fn normalize_model_ref(model_ref: &str, default_namespace: &str) -> (String, String) {
    if let Some((ns, path)) = model_ref.split_once(':') {
        (ns.to_string(), path.to_string())
    } else {
        (default_namespace.to_string(), model_ref.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{blockstate_id_from_asset_path, model_id_from_asset_path};

    #[test]
    fn model_id_keeps_subdirectory() {
        assert_eq!(
            model_id_from_asset_path("assets/minecraft/models/block/stone.json"),
            Some(("minecraft".to_string(), "block/stone".to_string()))
        );
        assert_eq!(
            model_id_from_asset_path("assets/create/models/item/cogwheel.json"),
            Some(("create".to_string(), "item/cogwheel".to_string()))
        );
    }

    #[test]
    fn blockstate_id_keeps_name() {
        assert_eq!(
            blockstate_id_from_asset_path("assets/minecraft/blockstates/stone.json"),
            Some(("minecraft".to_string(), "stone".to_string()))
        );
    }

    fn sample_model(textures: Vec<(&str, &str)>) -> super::ResolvedModel {
        use std::collections::HashMap;
        super::ResolvedModel {
            model_id: "minecraft:block/test".to_string(),
            ambient_occlusion: true,
            textures: textures
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            elements: vec![],
            display: HashMap::new(),
            is_item_generated: false,
        }
    }

    #[test]
    fn references_texture_matches_full_asset_path() {
        let model = sample_model(vec![("all", "block/stone")]);
        let pack = crate::model::normalize::PackInfo::default();
        let path = "assets/minecraft/textures/block/stone.png";
        assert!(model.references_texture("minecraft", "block/stone", path, &pack));
    }

    #[test]
    fn references_texture_matches_blocks_alias() {
        let model = sample_model(vec![("all", "blocks/stone")]);
        let pack = crate::model::normalize::PackInfo::default();
        let path = "assets/minecraft/textures/block/stone.png";
        assert!(model.references_texture("minecraft", "block/stone", path, &pack));
    }

    #[test]
    fn references_texture_matches_items_alias() {
        let model = sample_model(vec![("layer0", "items/apple")]);
        let pack = crate::model::normalize::PackInfo::default();
        let path = "assets/minecraft/textures/item/apple.png";
        assert!(model.references_texture("minecraft", "item/apple", path, &pack));
    }

    #[test]
    fn references_texture_rejects_unrelated_texture() {
        let model = sample_model(vec![("all", "block/dirt")]);
        let pack = crate::model::normalize::PackInfo::default();
        let path = "assets/minecraft/textures/block/stone.png";
        assert!(!model.references_texture("minecraft", "block/stone", path, &pack));
    }

    #[test]
    fn references_texture_ignores_hash_texture_refs() {
        let model = sample_model(vec![("all", "#particle")]);
        let pack = crate::model::normalize::PackInfo::default();
        let path = "assets/minecraft/textures/block/stone.png";
        assert!(!model.references_texture("minecraft", "block/stone", path, &pack));
    }

    #[test]
    fn normalize_texture_stem_maps_blocks_prefix() {
        assert_eq!(
            super::normalize_texture_stem("blocks/stone"),
            "block/stone"
        );
        assert_eq!(super::normalize_texture_stem("items/apple"), "item/apple");
    }

    #[test]
    fn cyclic_texture_refs_return_none() {
        use std::collections::HashMap;

        let mut textures = HashMap::new();
        textures.insert("particle".to_string(), "#all".to_string());
        textures.insert("all".to_string(), "#particle".to_string());
        let pack = crate::model::normalize::PackInfo::default();
        assert!(
            super::resolve_texture_value_with_pack("#particle", "minecraft", &textures, &pack)
                .is_none()
        );
    }
}