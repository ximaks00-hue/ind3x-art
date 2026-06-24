use crate::dto::{
    AssetDetails, AssetEntry, AssetKind, AssetWarning, RelationshipNode,
};
use crate::error::{CoreError, CoreResult};
use crate::index::texture_index;
use crate::model::parse::{parse_blockstate, parse_model};
use crate::model::types::{blockstate_id_from_asset_path, model_id_from_asset_path};
use crate::resolve::ModelRegistry;
use crate::state::Project;

pub fn build_asset_details(project: &Project, entry: &AssetEntry) -> CoreResult<AssetDetails> {
    let pack_format = project.pack_format;
    let mut warnings = Vec::new();
    let mut relationships = Vec::new();
    let mut texture_width = None;
    let mut texture_height = None;

    let linked_models = if entry.kind == AssetKind::Texture {
        texture_index::models_for_texture_path(&project.texture_model_index, &entry.path)
    } else {
        Vec::new()
    };

    match entry.kind {
        AssetKind::Texture => {
            if let Ok(bytes) = project.source.read(&entry.path) {
                if let Ok(img) = image::load_from_memory(&bytes) {
                    texture_width = Some(img.width());
                    texture_height = Some(img.height());
                }
            }
            for model in &linked_models {
                relationships.push(RelationshipNode {
                    id: model.model_id.clone(),
                    label: model.label.clone(),
                    kind: model.kind.clone(),
                    path: model.path.clone(),
                    children: Vec::new(),
                });
            }
            if linked_models.is_empty() {
                warnings.push(AssetWarning {
                    code: "orphanTexture".to_string(),
                    message: "No models reference this texture".to_string(),
                });
            }
        }
        AssetKind::BlockModel | AssetKind::ItemModel => {
            validate_model_json(project, entry, &mut warnings);
            if let Some((ns, model_path)) = model_id_from_asset_path(&entry.path) {
                let kind = match entry.kind {
                    AssetKind::ItemModel => "itemModel",
                    _ => "blockModel",
                };
                relationships.push(RelationshipNode {
                    id: format!("{ns}:{model_path}"),
                    label: entry.display_name.clone(),
                    kind: kind.to_string(),
                    path: entry.path.clone(),
                    children: Vec::new(),
                });
            }
        }
        AssetKind::Blockstate => {
            validate_blockstate_json(project, entry, &mut warnings);
            if let Some((ns, block)) = blockstate_id_from_asset_path(&entry.path) {
                relationships.push(RelationshipNode {
                    id: format!("{ns}:{block}"),
                    label: entry.display_name.clone(),
                    kind: "blockstate".to_string(),
                    path: entry.path.clone(),
                    children: linked_blockstate_models(project, &ns, &block),
                });
            }
        }
        _ => {}
    }

    Ok(AssetDetails {
        id: entry.id.clone(),
        kind: entry.kind,
        path: entry.path.clone(),
        namespace: entry.namespace.clone(),
        display_name: entry.display_name.clone(),
        pack_format,
        texture_width,
        texture_height,
        linked_models,
        relationships,
        warnings,
    })
}

fn linked_blockstate_models(
    project: &Project,
    namespace: &str,
    block_name: &str,
) -> Vec<RelationshipNode> {
    let pack = crate::model::normalize::PackInfo {
        pack_format: project.pack_format,
    };
    let mut cache = project.model_cache.lock().ok();
    let mut cache_map = cache.as_deref_mut();
    let mut empty = std::collections::HashMap::new();
    let cache_ref = cache_map.get_or_insert(&mut empty);
    let registry = ModelRegistry::new(project.source.as_ref(), cache_ref, pack);
    let Ok(blockstate) = registry.load_blockstate(namespace, block_name) else {
        return Vec::new();
    };
    crate::resolve::list_all_variant_models(&blockstate)
        .into_iter()
        .map(|(variant, key)| RelationshipNode {
            id: format!("{namespace}:{}", variant.model),
            label: key,
            kind: "variant".to_string(),
            path: format!("assets/{namespace}/models/{}.json", variant.model),
            children: Vec::new(),
        })
        .collect()
}

fn validate_model_json(project: &Project, entry: &AssetEntry, warnings: &mut Vec<AssetWarning>) {
    let bytes = match project.source.read(&entry.path) {
        Ok(b) => b,
        Err(_) => {
            warnings.push(AssetWarning {
                code: "missingFile".to_string(),
                message: "Model file not readable".to_string(),
            });
            return;
        }
    };
    let model = match parse_model(&bytes) {
        Ok(m) => m,
        Err(e) => {
            warnings.push(AssetWarning {
                code: "invalidJson".to_string(),
                message: format!("Invalid model JSON: {e}"),
            });
            return;
        }
    };
    if let Some(parent) = model.parent {
        let (p_ns, p_path) =
            crate::model::types::normalize_model_ref(&parent, &entry.namespace);
        let parent_path = format!("assets/{p_ns}/models/{p_path}.json");
        if project.source.read(&parent_path).is_err()
            && crate::builtins::get_builtin_model(&p_ns, &p_path).is_none()
        {
            warnings.push(AssetWarning {
                code: "missingParent".to_string(),
                message: format!("Parent model not found: {parent}"),
            });
        }
    }
    let pack = crate::model::normalize::PackInfo {
        pack_format: project.pack_format,
    };
    let mut cache = std::collections::HashMap::new();
    let mut registry = ModelRegistry::new(project.source.as_ref(), &mut cache, pack);
    if let Some((ns, model_path)) = model_id_from_asset_path(&entry.path) {
        if let Ok(resolved) = registry.resolve_model(&ns, &model_path) {
            for tex_ref in resolved.textures.values() {
                if tex_ref.starts_with('#') {
                    continue;
                }
                let path = crate::model::types::resolve_texture_value_with_pack(
                    tex_ref,
                    &ns,
                    &resolved.textures,
                    &pack,
                );
                if let Some(path) = path {
                    if project.source.read(&path).is_err() {
                        warnings.push(AssetWarning {
                            code: "brokenTextureRef".to_string(),
                            message: format!("Texture not found: {path}"),
                        });
                    }
                }
            }
        }
    }
}

fn validate_blockstate_json(
    project: &Project,
    entry: &AssetEntry,
    warnings: &mut Vec<AssetWarning>,
) {
    let bytes = match project.source.read(&entry.path) {
        Ok(b) => b,
        Err(_) => {
            warnings.push(AssetWarning {
                code: "missingFile".to_string(),
                message: "Blockstate file not readable".to_string(),
            });
            return;
        }
    };
    if parse_blockstate(&bytes).is_err() {
        warnings.push(AssetWarning {
            code: "invalidJson".to_string(),
            message: "Invalid blockstate JSON".to_string(),
        });
    }
}

pub fn find_entry_by_id(project: &Project, asset_id: &str) -> CoreResult<AssetEntry> {
    project
        .entries
        .iter()
        .find(|e| e.id == asset_id)
        .cloned()
        .ok_or_else(|| CoreError::AssetNotFound(asset_id.to_string()))
}
