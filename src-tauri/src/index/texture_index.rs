use std::collections::HashMap;

use crate::dto::{AssetEntry, AssetKind, ModelRefInfo};
use crate::model::types::texture_stem_from_entry_path;
use crate::resolve::ModelRegistry;

/// Build inverted index: texture asset path → models that reference it.
pub fn build_texture_model_index(
    registry: &mut ModelRegistry<'_>,
    entries: &[AssetEntry],
) -> HashMap<String, Vec<ModelRefInfo>> {
    let mut index: HashMap<String, Vec<ModelRefInfo>> = HashMap::new();
    let pack = *registry.pack();

    for entry in entries {
        match entry.kind {
            AssetKind::BlockModel | AssetKind::ItemModel => {
                if let Some((ns, model_path)) =
                    crate::model::types::model_id_from_asset_path(&entry.path)
                {
                    if let Ok(resolved) = registry.resolve_model(&ns, &model_path) {
                        let model_id = format!("{ns}:{model_path}");
                        let info = ModelRefInfo {
                            model_id: model_id.clone(),
                            path: entry.path.clone(),
                            kind: if entry.kind == AssetKind::BlockModel {
                                "blockModel".to_string()
                            } else {
                                "itemModel".to_string()
                            },
                            label: entry.display_name.clone(),
                        };
                        for texture_path in resolved.texture_paths(&ns, &pack) {
                            index
                                .entry(texture_path)
                                .or_default()
                                .push(info.clone());
                        }
                    }
                }
            }
            AssetKind::Blockstate => {
                if let Some((ns, block_name)) =
                    crate::model::types::blockstate_id_from_asset_path(&entry.path)
                {
                    if let Ok(variants) = registry.default_variant_models(&ns, &block_name) {
                        for (variant, key) in variants {
                            let (m_ns, m_path) =
                                crate::model::types::normalize_model_ref(&variant.model, &ns);
                            if let Ok(resolved) = registry.resolve_model(&m_ns, &m_path) {
                                let model_id = format!("{m_ns}:{m_path}");
                                let info = ModelRefInfo {
                                    model_id,
                                    path: entry.path.clone(),
                                    kind: "blockstate".to_string(),
                                    label: format!("{block_name} [{key}]"),
                                };
                                for texture_path in resolved.texture_paths(&m_ns, &pack) {
                                    index
                                        .entry(texture_path)
                                        .or_default()
                                        .push(info.clone());
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    for models in index.values_mut() {
        models.sort_by(|a, b| a.label.cmp(&b.label));
        models.dedup_by(|a, b| a.model_id == b.model_id);
    }

    index
}

/// True when changed paths can alter texture ↔ model links (not plain texture PNG writes).
pub fn paths_affect_texture_model_index(paths: &[String]) -> bool {
    paths.iter().any(|raw| {
        let path = raw.replace('\\', "/");
        path.contains("/models/") || path.contains("/blockstates/")
    })
}

/// Update inverted index for model/blockstate paths touched by an incremental refresh.
pub fn patch_texture_model_index(
    registry: &mut ModelRegistry<'_>,
    entries: &[AssetEntry],
    index: &mut HashMap<String, Vec<ModelRefInfo>>,
    changed_paths: &[String],
) {
    use std::collections::HashSet;

    let changed: HashSet<String> = changed_paths
        .iter()
        .map(|p| crate::source::normalize_zip_path(p))
        .collect();

    let rebuild: Vec<&AssetEntry> = entries
        .iter()
        .filter(|e| changed.contains(&e.path))
        .filter(|e| {
            matches!(
                e.kind,
                AssetKind::BlockModel | AssetKind::ItemModel | AssetKind::Blockstate
            )
        })
        .collect();

    if rebuild.is_empty() {
        return;
    }

    for entry in &rebuild {
        for models in index.values_mut() {
            models.retain(|m| m.path != entry.path);
        }
    }

    let owned: Vec<AssetEntry> = rebuild.into_iter().cloned().collect();
    let patch = build_texture_model_index(registry, &owned);
    for (texture_path, models) in patch {
        let slot = index.entry(texture_path).or_default();
        for model in models {
            if !slot.iter().any(|m| m.model_id == model.model_id) {
                slot.push(model);
            }
        }
        slot.sort_by(|a, b| a.label.cmp(&b.label));
        slot.dedup_by(|a, b| a.model_id == b.model_id);
    }
}

/// Lookup models for a texture path using the inverted index, with stem fallback.
pub fn models_for_texture_path(
    index: &HashMap<String, Vec<ModelRefInfo>>,
    texture_asset_path: &str,
) -> Vec<ModelRefInfo> {
    if let Some(models) = index.get(texture_asset_path) {
        return models.clone();
    }

    let stem = texture_stem_from_entry_path(texture_asset_path);
    let normalized = crate::model::types::normalize_texture_asset_path(texture_asset_path);

    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (path, models) in index {
        let path_stem = texture_stem_from_entry_path(path);
        if crate::model::types::normalize_texture_asset_path(path) == normalized
            || path_stem == stem
        {
            for model in models {
                if seen.insert(model.model_id.clone()) {
                    results.push(model.clone());
                }
            }
        }
    }

    results.sort_by(|a, b| a.label.cmp(&b.label));
    results
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{build_texture_model_index, models_for_texture_path};
    use crate::model::normalize::PackInfo;
    use crate::resolve::ModelRegistry;
    use crate::source::{AssetSource, FolderSource};

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack")
    }

    #[test]
    fn indexes_textures_from_simple_pack() {
        let source = FolderSource::new(&fixture_root()).expect("fixture");
        let paths = source.list_entries().expect("list");
        let entries: Vec<_> = paths
            .iter()
            .filter_map(|p| crate::index::classify::classify_path(p))
            .collect();
        let mut cache = std::collections::HashMap::new();
        let pack = PackInfo::default();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack);
        let index = build_texture_model_index(&mut registry, &entries);
        let stone_path = "assets/minecraft/textures/block/test_stone.png";
        let models = models_for_texture_path(&index, stone_path);
        assert!(
            !models.is_empty(),
            "expected stone texture to link to at least one model"
        );
    }
}
