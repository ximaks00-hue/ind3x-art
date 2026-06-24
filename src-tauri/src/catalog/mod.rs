mod builder;
mod cache;
mod category;
mod creative_tabs;
mod dedup;
pub mod patch;
pub(crate) mod icon;
pub(crate) mod icon_cache;
mod lang;
pub mod query;
pub(crate) mod textures;
mod texture_catalog;

mod pipeline;

#[cfg(test)]
#[path = "tests/ic2_integration.rs"]
mod ic2_integration;

pub use builder::{build_from_entries, build_from_entries_with_options, CatalogBuildOptions};
pub use icon::compile_catalog_icon_model;
pub use icon::compile_catalog_placed_model;
pub use creative_tabs::{load_creative_tabs, CreativeTabOrder};
pub use patch::patch_project_catalog;
pub use query::{catalog_facets, get_catalog_entry, get_catalog_entry_indexed, query_catalog};

use crate::dto::{AssetEntry, AssetKind, CatalogEntry, CatalogResolveKind};
use crate::error::{log_if_err, CoreResult};
use crate::model::normalize::PackInfo;
use crate::resolve::ModelRegistry;
use crate::source::AssetSource;
use crate::state::{arc_catalog, Project};

use self::pipeline::{build_deduped_catalog, CatalogBuildCtx};
use self::textures::enrich_catalog_texture_paths;

/// Assets that can produce catalog rows (blocks/items).
pub fn catalog_source_entry_count(entries: &[AssetEntry]) -> usize {
    entries
        .iter()
        .filter(|e| {
            matches!(
                e.kind,
                AssetKind::Blockstate | AssetKind::ItemModel | AssetKind::BlockModel
            )
        })
        .count()
}

pub fn catalog_needs_rebuild(project: &Project) -> bool {
    if !project.catalog.entries.is_empty() {
        return false;
    }
    if catalog_source_entry_count(&project.index.entries) > 0 {
        return true;
    }
    // Texture-only packs (IC2 etc.) need a catalog when block/item textures exist.
    texture_catalog::pack_has_block_item_textures(&project.index.entries)
}

/// Reject stale catalog caches (e.g. pre–texture-fallback builds on texture-only JARs).
fn cached_catalog_trustworthy(entries: &[AssetEntry], catalog: &[CatalogEntry]) -> bool {
    if catalog.is_empty() {
        return catalog_source_entry_count(entries) == 0
            && !texture_catalog::pack_has_block_item_textures(entries);
    }
    if catalog_source_entry_count(entries) > 0 {
        return true;
    }
    if !texture_catalog::pack_has_block_item_textures(entries) {
        return true;
    }
    catalog
        .iter()
        .any(|e| e.resolve_kind == CatalogResolveKind::Texture)
}

/// Build catalog entries from indexed assets (no cache, no texture enrichment).
#[allow(dead_code)]
pub fn build_catalog(entries: &[crate::dto::AssetEntry], source: Option<&dyn AssetSource>) -> Vec<CatalogEntry> {
    build_from_entries(entries, source)
}

/// Build catalog for a project: sled cache → build → texture enrichment → persist.
/// Returns `true` when loaded from sled cache.
pub fn build_project_catalog(project: &mut Project, db: &sled::Db) -> CoreResult<bool> {
    let fingerprint = project.index.fingerprint.clone();
    let language = project.catalog.language.clone();
    if let Ok(Some(catalog)) = cache::load_cached_catalog(db, &fingerprint, &language) {
        if cached_catalog_trustworthy(&project.index.entries, &catalog) {
            let entries = arc_catalog(catalog);
            project.catalog.id_index = crate::state::build_catalog_id_index(&entries);
            project.catalog.entries = entries;
            return Ok(true);
        }
        tracing::warn!(
            entry_count = project.index.entries.len(),
            cached_catalog = catalog.len(),
            "rejecting stale catalog cache — rebuilding"
        );
        log_if_err(
            cache::invalidate_catalog_cache(db, &fingerprint, &language),
            "invalidate stale catalog cache",
        );
    }

    let source = project.source.as_ref();
    project.catalog.creative_tab_order = load_creative_tabs(source);
    let ctx = CatalogBuildCtx::new(&project.index.entries, Some(source), &language);
    let catalog = build_deduped_catalog(&ctx);
    let pack = PackInfo {
        pack_format: project.pack_format,
    };
    let mut model_cache = crate::state::lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut model_cache, pack);
    let mut entries = arc_catalog(catalog);
    enrich_catalog_texture_paths(&mut entries, &mut registry, &pack);
    drop(model_cache);

    let flat: Vec<CatalogEntry> = entries.iter().map(|e| e.as_ref().clone()).collect();
    cache::save_catalog_cache(db, &fingerprint, &language, &flat)?;
    project.catalog.id_index = crate::state::build_catalog_id_index(&entries);
    project.catalog.entries = entries;
    Ok(false)
}

/// Rebuild catalog with a new display language (invalidates cache for fingerprint).
pub fn rebuild_project_catalog(project: &mut Project, db: &sled::Db, language: &str) -> CoreResult<bool> {
    project.catalog.language = language.to_string();
    log_if_err(
        invalidate_project_catalog_cache(db, &project.index.fingerprint),
        "invalidate catalog cache for language rebuild",
    );
    log_if_err(
        icon_cache::invalidate_icon_cache_prefix(db, &project.index.fingerprint),
        "invalidate icon cache for language rebuild",
    );
    build_project_catalog(project, db)
}

pub fn invalidate_project_catalog_cache(db: &sled::Db, fingerprint: &str) -> crate::error::CoreResult<()> {
    cache::invalidate_catalog_cache_prefix(db, fingerprint)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::index::classify::classify_path;
    use crate::source::FolderSource;

    use super::*;

    #[test]
    fn catalog_builds_for_simple_pack() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let source = FolderSource::new(&root).expect("source");
        let entries: Vec<_> = source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|p| classify_path(&p))
            .collect();
        let catalog = build_catalog(&entries, Some(&source));
        assert!(catalog.len() >= 1);
    }
}
