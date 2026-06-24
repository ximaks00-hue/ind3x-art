use sled::Db;

use crate::dto::CatalogEntry;
use crate::error::{log_if_err, CoreError, CoreResult};

const CACHE_PREFIX: &str = "catalog:v2:";

pub fn cache_key_for(fingerprint: &str, language: &str) -> String {
    format!("{CACHE_PREFIX}{fingerprint}:{language}")
}

pub fn load_cached_catalog(
    db: &Db,
    fingerprint: &str,
    language: &str,
) -> CoreResult<Option<Vec<CatalogEntry>>> {
    let key = cache_key_for(fingerprint, language);
    let Some(bytes) = db.get(key.as_bytes())? else {
        return Ok(None);
    };
    let catalog: Vec<CatalogEntry> = serde_json::from_slice(&bytes)
        .map_err(|e| CoreError::Internal(format!("catalog cache decode failed: {e}")))?;
    Ok(Some(catalog))
}

pub fn save_catalog_cache(
    db: &Db,
    fingerprint: &str,
    language: &str,
    catalog: &[CatalogEntry],
) -> CoreResult<()> {
    if catalog.is_empty() {
        log_if_err(
            invalidate_catalog_cache(db, fingerprint, language),
            "invalidate empty catalog cache",
        );
        return Ok(());
    }
    let encoded = serde_json::to_vec(catalog)
        .map_err(|e| CoreError::Internal(format!("catalog cache encode failed: {e}")))?;
    db.insert(cache_key_for(fingerprint, language).as_bytes(), encoded)?;
    Ok(())
}

pub fn invalidate_catalog_cache(db: &Db, fingerprint: &str, language: &str) -> CoreResult<()> {
    db.remove(cache_key_for(fingerprint, language).as_bytes())?;
    Ok(())
}

pub fn invalidate_catalog_cache_prefix(db: &Db, fingerprint: &str) -> CoreResult<()> {
    let prefix = format!("{CACHE_PREFIX}{fingerprint}:");
    for item in db.scan_prefix(prefix.as_bytes()) {
        let (key, _) = item?;
        db.remove(key)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{
        CatalogCategory, CatalogEntry, CatalogEntryKind, CatalogPresentation, CatalogResolveKind,
    };

    fn sample_entry(id: &str) -> CatalogEntry {
        let path = format!("assets/minecraft/blockstates/{id}.json");
        CatalogEntry {
            id: id.to_string(),
            namespace: "minecraft".to_string(),
            display_name: id.to_string(),
            kind: CatalogEntryKind::Block,
            source_path: path.clone(),
            resolve_kind: CatalogResolveKind::Blockstate,
            default_variant_key: Some(String::new()),
            category: CatalogCategory::Building,
            search_tokens: vec![id.to_string()],
            texture_paths: vec![],
            icon_key: format!("minecraft:{id}:"),
            aliases: vec![],
            block_id: Some(id.to_string()),
            item_id: None,
            icon_model_path: None,
            studio_model_path: path,
            variant_keys: vec![String::new()],
            presentation: CatalogPresentation::Block,
        }
    }

    #[test]
    fn round_trips_catalog_cache() {
        let db = sled::Config::new().temporary(true).open().expect("db");
        let catalog = vec![sample_entry("stone"), sample_entry("dirt")];
        save_catalog_cache(&db, "fp-test", "en_us", &catalog).expect("save");
        let loaded = load_cached_catalog(&db, "fp-test", "en_us")
            .expect("load")
            .expect("cached");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "stone");
        invalidate_catalog_cache(&db, "fp-test", "en_us").expect("invalidate");
        assert!(load_cached_catalog(&db, "fp-test", "en_us")
            .expect("load")
            .is_none());
    }

    #[test]
    fn empty_catalog_is_not_persisted() {
        let db = sled::Config::new().temporary(true).open().expect("db");
        save_catalog_cache(&db, "fp-empty", "en_us", &[]).expect("save");
        assert!(load_cached_catalog(&db, "fp-empty", "en_us")
            .expect("load")
            .is_none());
    }
}
