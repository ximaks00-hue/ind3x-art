use std::sync::Arc;

use crate::catalog::CreativeTabOrder;
use crate::dto::{AssetEntry, CatalogEntry, ModelRefInfo, SaveJournalEntry};
use crate::model::types::ResolvedModel;

/// Wrap built catalog rows for cheap sharing across queries.
pub fn arc_catalog(entries: Vec<CatalogEntry>) -> Vec<Arc<CatalogEntry>> {
    entries.into_iter().map(Arc::new).collect()
}

/// Build O(1) id → index map for a catalog slice.
pub fn build_catalog_id_index(entries: &[Arc<CatalogEntry>]) -> std::collections::HashMap<String, usize> {
    entries.iter().enumerate().map(|(i, e)| (e.id.clone(), i)).collect()
}

/// Indexed pack assets, fingerprint, and resolve caches.
pub struct IndexState {
    pub fingerprint: String,
    pub entries: Vec<AssetEntry>,
    pub entry_id_index: std::collections::HashMap<String, usize>,
    pub texture_model_index: std::collections::HashMap<String, Vec<ModelRefInfo>>,
    pub model_cache: std::sync::Mutex<std::collections::HashMap<String, Arc<ResolvedModel>>>,
}

/// Built catalog rows, locale, and creative-tab ordering.
pub struct CatalogState {
    pub entries: Vec<Arc<CatalogEntry>>,
    /// O(1) lookup index from catalog entry ID → index in `entries`.
    pub id_index: std::collections::HashMap<String, usize>,
    pub creative_tab_order: CreativeTabOrder,
    pub language: String,
}

/// Undo journal for texture saves.
pub struct SaveState {
    pub journal: Vec<SaveJournalEntry>,
}
