mod builder;
mod cache;
mod category;
mod dedup;
mod lang;
pub mod query;
pub(crate) mod textures;

pub use builder::build_from_entries;
pub use query::{catalog_facets, get_catalog_entry, query_catalog};

use crate::dto::CatalogEntry;
use crate::model::normalize::PackInfo;
use crate::resolve::ModelRegistry;
use crate::source::AssetSource;
use crate::state::Project;

use self::textures::enrich_catalog_texture_paths;

/// Build catalog entries from indexed assets (no cache, no texture enrichment).
#[allow(dead_code)]
pub fn build_catalog(entries: &[crate::dto::AssetEntry], source: Option<&dyn AssetSource>) -> Vec<CatalogEntry> {
    build_from_entries(entries, source)
}

/// Build catalog for a project: sled cache → build → texture enrichment → persist.
/// Returns `true` when loaded from sled cache.
pub fn build_project_catalog(project: &mut Project, db: &sled::Db) -> bool {
    let fingerprint = project.fingerprint.clone();
    if let Ok(Some(catalog)) = cache::load_cached_catalog(db, &fingerprint) {
        project.catalog = catalog;
        return true;
    }

    let source = project.source.as_ref();
    let mut catalog = build_from_entries(&project.entries, Some(source));
    let pack = PackInfo {
        pack_format: project.pack_format,
    };
    let mut model_cache = project.model_cache.lock().expect("model cache poisoned");
    let mut registry = ModelRegistry::new(source, &mut model_cache, pack);
    enrich_catalog_texture_paths(&mut catalog, &mut registry, &pack);
    drop(model_cache);

    let _ = cache::save_catalog_cache(db, &fingerprint, &catalog);
    project.catalog = catalog;
    false
}

pub fn invalidate_project_catalog_cache(db: &sled::Db, fingerprint: &str) -> crate::error::CoreResult<()> {
    cache::invalidate_catalog_cache(db, fingerprint)
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
