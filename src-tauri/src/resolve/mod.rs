use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::builtins::get_builtin_model;
use crate::dto::{AssetKind, ModelRefInfo, TextureMetaInfo};
use crate::error::{CoreError, CoreResult};
use crate::model::mcmeta::animation_from_mcmeta;
use crate::model::normalize::{normalize_model_path, normalize_texture_ref, PackInfo};
use crate::model::parse::{parse_blockstate, parse_mcmeta, parse_model};
use crate::model::types::{
    normalize_model_ref, ResolvedModel, VariantValue, RawBlockstate, RawModel, RawVariantModel,
};
use crate::source::AssetSource;

const MAX_PARENT_DEPTH: usize = 32;

pub struct ModelRegistry<'a> {
    source: &'a dyn AssetSource,
    cache: &'a mut HashMap<String, Arc<ResolvedModel>>,
    pack: PackInfo,
}

impl<'a> ModelRegistry<'a> {
    pub fn new(
        source: &'a dyn AssetSource,
        cache: &'a mut HashMap<String, Arc<ResolvedModel>>,
        pack: PackInfo,
    ) -> Self {
        Self {
            source,
            cache,
            pack,
        }
    }

    pub fn pack(&self) -> &PackInfo {
        &self.pack
    }

    pub fn resolve_model(
        &mut self,
        namespace: &str,
        model_path: &str,
    ) -> CoreResult<Arc<ResolvedModel>> {
        let model_path = normalize_model_path(model_path, &self.pack);
        let model_id = format!("{namespace}:{model_path}");
        if let Some(cached) = self.cache.get(&model_id) {
            return Ok(Arc::clone(cached));
        }

        let (ns, path) = normalize_model_ref(&model_path, namespace);
        let resolved = Arc::new(self.resolve_model_inner(&ns, &path, &mut HashSet::new())?);
        self.cache.insert(model_id, Arc::clone(&resolved));
        Ok(resolved)
    }

    pub fn texture_meta_for_path(&self, texture_path: &str) -> CoreResult<Option<TextureMetaInfo>> {
        let png_bytes = match self.source.read(texture_path) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(None),
        };

        let preview = crate::image::encode_texture_full(&png_bytes)?;
        let animation = match self.source.read(&format!("{texture_path}.mcmeta")) {
            Ok(bytes) => {
                let raw = parse_mcmeta(&bytes)?;
                animation_from_mcmeta(&raw, preview.height)
            }
            Err(_) => None,
        };

        Ok(Some(TextureMetaInfo {
            width: preview.width,
            height: preview.height,
            animation,
        }))
    }

    fn resolve_model_inner(
        &self,
        namespace: &str,
        model_path: &str,
        visited: &mut HashSet<String>,
    ) -> CoreResult<ResolvedModel> {
        let model_id = format!("{namespace}:{model_path}");
        if !visited.insert(model_id.clone()) {
            return Err(CoreError::Internal(format!("model cycle at {model_id}")));
        }

        let raw = self.load_raw_model(namespace, model_path)?;
        let mut chain: Vec<RawModel> = vec![raw];

        let mut current_ns = namespace.to_string();
        let mut parent_depth = 0usize;

        for _ in 0..MAX_PARENT_DEPTH {
            let parent = chain.last().and_then(|m| m.parent.clone());
            let Some(parent) = parent else { break };
            parent_depth += 1;
            if parent_depth > MAX_PARENT_DEPTH {
                return Err(CoreError::Internal(format!(
                    "model parent depth exceeded for {model_id}"
                )));
            }
            let parent = normalize_model_path(&parent, &self.pack);
            let (p_ns, p_path) = normalize_model_ref(&parent, &current_ns);
            current_ns = p_ns;
            let pid = format!("{current_ns}:{p_path}");
            if visited.contains(&pid) {
                return Err(CoreError::Internal(format!("model cycle at {pid}")));
            }
            visited.insert(pid);
            chain.push(self.load_raw_model(&current_ns, &p_path)?);
        }

        let mut textures = HashMap::new();
        let mut display = HashMap::new();
        let mut elements = Vec::new();
        let mut ambient_occlusion = true;
        let mut is_item_generated = false;

        for model in chain.iter().rev() {
            for (key, value) in &model.textures {
                textures.insert(key.clone(), normalize_texture_ref(value, &self.pack));
            }
            display.extend(model.display.clone());
            if let Some(els) = &model.elements {
                elements = els.clone();
            }
            if let Some(ao) = model.ambient_occlusion {
                ambient_occlusion = ao;
            }
            if let Some(parent) = &model.parent {
                if is_item_generated_parent(parent, namespace, &self.pack) {
                    is_item_generated = true;
                }
            }
            if model_path.starts_with("item/") && elements.is_empty() {
                is_item_generated = true;
            }
        }

        Ok(ResolvedModel {
            model_id,
            ambient_occlusion,
            textures,
            elements,
            display,
            is_item_generated,
        })
    }

    fn load_raw_model(&self, namespace: &str, model_path: &str) -> CoreResult<RawModel> {
        if let Some(builtin) = get_builtin_model(namespace, model_path) {
            return Ok(builtin);
        }
        let file_path = format!("assets/{namespace}/models/{model_path}.json");
        let bytes = self
            .source
            .read(&file_path)
            .map_err(|_| CoreError::Internal(format!("missing model: {file_path}")))?;
        parse_model(&bytes)
    }

    pub fn load_blockstate(&self, namespace: &str, block_name: &str) -> CoreResult<RawBlockstate> {
        let file_path = format!("assets/{namespace}/blockstates/{block_name}.json");
        let bytes = self
            .source
            .read(&file_path)
            .map_err(|_| CoreError::Internal(format!("missing blockstate: {file_path}")))?;
        parse_blockstate(&bytes)
    }

    pub fn default_variant_models(
        &mut self,
        namespace: &str,
        block_name: &str,
    ) -> CoreResult<Vec<(RawVariantModel, String)>> {
        let blockstate = self.load_blockstate(namespace, block_name)?;
        Ok(collect_variant_models(&blockstate))
    }
}

pub fn collect_variant_models(blockstate: &RawBlockstate) -> Vec<(RawVariantModel, String)> {
    let mut out = Vec::new();

    if !blockstate.variants.is_empty() {
        for (key, value) in &blockstate.variants {
            match value {
                VariantValue::Single(model) => out.push((model.clone(), key.clone())),
                VariantValue::Multiple(models) => {
                    let total_weight: u32 = models.iter().map(|m| m.weight.max(1)).sum();
                    let hash_seed = key
                        .bytes()
                        .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
                    let pick = hash_seed % total_weight.max(1);
                    let mut cumulative = 0u32;
                    let mut chosen = &models[0];
                    for m in models {
                        cumulative += m.weight.max(1);
                        if pick < cumulative {
                            chosen = m;
                            break;
                        }
                    }
                    out.push((chosen.clone(), key.clone()));
                }
            }
        }
        return out;
    }

    if blockstate.multipart.is_some() {
        return crate::model::multipart::multipart_variant_keys(blockstate);
    }

    out
}

/// All variant keys for UI (expands weighted multiples into separate preview options).
pub fn list_all_variant_models(blockstate: &RawBlockstate) -> Vec<(RawVariantModel, String)> {
    let mut out = Vec::new();

    if !blockstate.variants.is_empty() {
        for (key, value) in &blockstate.variants {
            match value {
                VariantValue::Single(model) => out.push((model.clone(), key.clone())),
                VariantValue::Multiple(models) => {
                    for (idx, model) in models.iter().enumerate() {
                        let suffix = if models.len() > 1 {
                            format!("{key}#{idx}")
                        } else {
                            key.clone()
                        };
                        out.push((model.clone(), suffix));
                    }
                }
            }
        }
        return out;
    }

    if blockstate.multipart.is_some() {
        return crate::model::multipart::multipart_variant_keys(blockstate);
    }

    out
}

pub fn find_models_for_texture(
    registry: &mut ModelRegistry<'_>,
    entries: &[crate::dto::AssetEntry],
    texture_asset_path: &str,
    texture_stem: &str,
) -> CoreResult<Vec<ModelRefInfo>> {
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let pack = *registry.pack();

    for entry in entries {
        match entry.kind {
            AssetKind::BlockModel | AssetKind::ItemModel => {
                if let Some((ns, model_path)) =
                    crate::model::types::model_id_from_asset_path(&entry.path)
                {
                    if let Ok(resolved) = registry.resolve_model(&ns, &model_path) {
                        if resolved.references_texture(&ns, texture_stem, texture_asset_path, &pack)
                        {
                            let id = format!("{ns}:{model_path}");
                            if seen.insert(id.clone()) {
                                results.push(ModelRefInfo {
                                    model_id: id,
                                    path: entry.path.clone(),
                                    kind: asset_kind_label(entry.kind).to_string(),
                                    label: entry.display_name.clone(),
                                });
                            }
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
                            let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
                            if let Ok(resolved) = registry.resolve_model(&m_ns, &m_path) {
                                if resolved.references_texture(
                                    &m_ns,
                                    texture_stem,
                                    texture_asset_path,
                                    &pack,
                                ) {
                                    let id = format!("{m_ns}:{m_path}");
                                    if seen.insert(id.clone()) {
                                        results.push(ModelRefInfo {
                                            model_id: id,
                                            path: entry.path.clone(),
                                            kind: "blockstate".to_string(),
                                            label: format!("{block_name} [{key}]"),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    results.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(results)
}

fn is_item_generated_parent(parent: &str, namespace: &str, pack: &PackInfo) -> bool {
    let normalized = normalize_model_path(parent, pack);
    let (p_ns, p_path) = normalize_model_ref(&normalized, namespace);
    p_path == "item/generated" || (p_ns == "builtin" && p_path == "generated")
}

fn asset_kind_label(kind: AssetKind) -> &'static str {
    match kind {
        AssetKind::BlockModel => "blockModel",
        AssetKind::ItemModel => "itemModel",
        AssetKind::Blockstate => "blockstate",
        AssetKind::Texture => "texture",
        AssetKind::TextureMeta => "textureMeta",
        AssetKind::PackMeta => "packMeta",
        AssetKind::Lang => "lang",
        AssetKind::Sound => "sound",
        AssetKind::Other => "other",
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::ModelRegistry;
    use crate::builtins::get_builtin_model;
    use crate::model::normalize::PackInfo;
    use crate::source::folder::FolderSource;

    #[test]
    fn builtin_cube_all_has_parent() {
        let raw = get_builtin_model("minecraft", "block/cube_all").expect("cube_all");
        assert_eq!(raw.parent.as_deref(), Some("block/cube"));
    }

    #[test]
    fn resolves_parent_chain_from_folder() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let source = FolderSource::new(&root).expect("folder");
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, PackInfo::default());
        let resolved = registry
            .resolve_model("minecraft", "block/test_stone")
            .expect("resolve");
        assert!(!resolved.elements.is_empty());
    }

    #[test]
    fn resolves_hash_texture_aliases() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let source = FolderSource::new(&root).expect("folder");
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, PackInfo::default());
        let resolved = registry
            .resolve_model("minecraft", "block/test_stone")
            .expect("resolve");
        let paths = resolved.texture_paths("minecraft", &PackInfo::default());
        assert!(paths.iter().any(|p| p.ends_with("test_stone.png")));
    }

    #[test]
    fn normalizes_legacy_texture_refs() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/legacy_pack");
        let source = FolderSource::new(&root).expect("folder");
        let pack = crate::model::normalize::read_pack_info(&source);
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack.clone());
        let resolved = registry
            .resolve_model("minecraft", "block/legacy_stone")
            .expect("resolve");
        let paths = resolved.texture_paths("minecraft", &pack);
        assert!(paths.iter().any(|p| p.contains("legacy_stone.png")));
    }

    #[test]
    fn finds_models_in_simple_pack() {
        use super::find_models_for_texture;
        use crate::index::classify::classify_path;
        use crate::model::types::texture_stem_from_entry_path;

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let source = FolderSource::new(&root).expect("folder");
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, PackInfo::default());
        let texture_path = "assets/minecraft/textures/block/test_stone.png";
        let model_entry = classify_path("assets/minecraft/models/block/test_stone.json").unwrap();
        let entries = vec![model_entry];
        let stem = texture_stem_from_entry_path(texture_path);
        let models = find_models_for_texture(&mut registry, &entries, texture_path, &stem)
            .expect("find");
        assert_eq!(models.len(), 1);
        assert!(models[0].model_id.contains("test_stone"));
    }

    #[test]
    fn finds_models_with_blocks_texture_alias() {
        use super::find_models_for_texture;
        use crate::dto::AssetKind;
        use crate::index::classify::classify_path;
        use crate::model::types::texture_stem_from_entry_path;

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let source = FolderSource::new(&root).expect("folder");
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, PackInfo::default());
        let texture_path = "assets/minecraft/textures/block/test_stone.png";
        let model_entry =
            classify_path("assets/minecraft/models/block/test_stone_blocks_ref.json").unwrap();
        assert_eq!(model_entry.kind, AssetKind::BlockModel);
        let entries = vec![model_entry];
        let stem = texture_stem_from_entry_path(texture_path);
        let models = find_models_for_texture(&mut registry, &entries, texture_path, &stem)
            .expect("find");
        assert_eq!(models.len(), 1);
    }

    #[test]
    fn finds_models_for_legacy_texture_path() {
        use super::find_models_for_texture;
        use crate::dto::{AssetEntry, AssetKind};
        use crate::model::types::texture_stem_from_entry_path;

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/legacy_pack");
        let source = FolderSource::new(&root).expect("folder");
        let pack = crate::model::normalize::read_pack_info(&source);
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack);
        let texture_path = "assets/minecraft/textures/block/legacy_stone.png";
        let entries = vec![AssetEntry {
            id: "minecraft:assets/minecraft/models/block/legacy_stone.json".to_string(),
            kind: AssetKind::BlockModel,
            namespace: "minecraft".to_string(),
            path: "assets/minecraft/models/block/legacy_stone.json".to_string(),
            display_name: "legacy_stone".to_string(),
            linked_model_count: None,
        }];
        let stem = texture_stem_from_entry_path(texture_path);
        let models = find_models_for_texture(&mut registry, &entries, texture_path, &stem)
            .expect("find");
        assert_eq!(models.len(), 1);
        assert!(models[0].model_id.contains("legacy_stone"));
    }

    #[test]
    fn compiles_multipart_fence() {
        use crate::compile::compile_multipart_renderable;
        use crate::dto::RenderableKind;
        use crate::model::multipart::{parse_variant_state, resolve_multipart_models};

        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/multipart_pack");
        let source = FolderSource::new(&root).expect("folder");
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, PackInfo::default());
        let blockstate = registry
            .load_blockstate("minecraft", "test_fence")
            .expect("blockstate");
        let state = parse_variant_state("north=true");
        let variants = resolve_multipart_models(&blockstate, &state);
        let compiled = compile_multipart_renderable(
            &mut registry,
            "minecraft",
            &variants,
            &PackInfo::default(),
        )
        .expect("compile");
        assert_eq!(compiled.kind, RenderableKind::Multipart);
        assert!(compiled.cuboids.len() >= 2);
    }
}
