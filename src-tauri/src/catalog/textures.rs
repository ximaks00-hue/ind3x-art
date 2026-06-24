use std::collections::HashSet;
use std::sync::Arc;

use crate::dto::{CatalogEntry, CatalogResolveKind};
use crate::model::normalize::PackInfo;
use crate::model::types::{
    blockstate_id_from_asset_path, model_id_from_asset_path, normalize_model_ref,
};
use crate::resolve::ModelRegistry;

/// Fill `texture_paths` on each catalog entry via model resolution.
pub fn enrich_catalog_texture_paths(
    catalog: &mut [Arc<CatalogEntry>],
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) {
    warm_model_cache_for_catalog(catalog, registry);

    for slot in catalog.iter_mut() {
        let mut next = slot.as_ref().clone();
        next.texture_paths = texture_paths_for_entry(&next, registry, pack);
        *slot = Arc::new(next);
    }
}

/// Resolve shared blockstates/models once before per-entry texture lookup.
fn warm_model_cache_for_catalog(catalog: &[Arc<CatalogEntry>], registry: &mut ModelRegistry<'_>) {
    let mut blockstates: HashSet<(String, String)> = HashSet::new();
    let mut models: HashSet<(String, String)> = HashSet::new();

    for entry in catalog {
        match entry.resolve_kind {
            CatalogResolveKind::Blockstate => {
                if let Some(ids) = blockstate_id_from_asset_path(&entry.source_path) {
                    blockstates.insert(ids);
                }
            }
            CatalogResolveKind::Model => {
                if let Some(ids) = model_id_from_asset_path(&entry.source_path) {
                    models.insert(ids);
                }
            }
            CatalogResolveKind::Texture => {}
        }
    }

    for (ns, block_name) in blockstates {
        let _ = registry.default_variant_models(&ns, &block_name);
    }
    for (ns, model_path) in models {
        let _ = registry.resolve_model(&ns, &model_path);
    }
}

fn texture_paths_for_entry(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) -> Vec<String> {
    match entry.resolve_kind {
        CatalogResolveKind::Blockstate => {
            let Some((ns, block_name)) = blockstate_id_from_asset_path(&entry.source_path) else {
                return vec![];
            };
            let Ok(variants) = registry.default_variant_models(&ns, &block_name) else {
                return vec![];
            };
            let Some((variant, _)) = variants.first() else {
                return vec![];
            };
            let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
            registry
                .resolve_model(&m_ns, &m_path)
                .map(|resolved| resolved.texture_paths(&m_ns, pack))
                .unwrap_or_default()
        }
        CatalogResolveKind::Model => {
            let Some((ns, model_path)) = model_id_from_asset_path(&entry.source_path) else {
                return vec![];
            };
            registry
                .resolve_model(&ns, &model_path)
                .map(|resolved| resolved.texture_paths(&ns, pack))
                .unwrap_or_default()
        }
        CatalogResolveKind::Texture => entry.texture_paths.clone(),
    }
}
