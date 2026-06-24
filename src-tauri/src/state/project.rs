use std::sync::Arc;

use crate::catalog::CreativeTabOrder;
use crate::dto::{AssetEntry, CatalogEntry, ModelRefInfo, SaveJournalEntry};
use crate::model::types::ResolvedModel;

/// Wrap built catalog rows for cheap sharing across queries.
pub fn arc_catalog(entries: Vec<CatalogEntry>) -> Vec<Arc<CatalogEntry>> {
    entries.into_iter().map(Arc::new).collect()
}

/// Indexed pack assets, fingerprint, and resolve caches.
pub struct IndexState {
    pub fingerprint: String,
    pub entries: Vec<AssetEntry>,
    pub texture_model_index: std::collections::HashMap<String, Vec<ModelRefInfo>>,
    pub model_cache: std::sync::Mutex<std::collections::HashMap<String, ResolvedModel>>,
}

/// Built catalog rows, locale, and creative-tab ordering.
pub struct CatalogState {
    pub entries: Vec<Arc<CatalogEntry>>,
    pub creative_tab_order: CreativeTabOrder,
    pub language: String,
}

/// Undo journal for texture saves.
pub struct SaveState {
    pub journal: Vec<SaveJournalEntry>,
}
