use sled::Db;

use crate::dto::CatalogEntry;
use crate::error::{CoreError, CoreResult};

const CACHE_PREFIX: &str = "catalog:v1:";

pub fn cache_key_for(fingerprint: &str) -> String {
    format!("{CACHE_PREFIX}{fingerprint}")
}

pub fn load_cached_catalog(db: &Db, fingerprint: &str) -> CoreResult<Option<Vec<CatalogEntry>>> {
    let key = cache_key_for(fingerprint);
    let Some(bytes) = db.get(key.as_bytes())? else {
        return Ok(None);
    };
    let catalog: Vec<CatalogEntry> = serde_json::from_slice(&bytes)
        .map_err(|e| CoreError::Internal(format!("catalog cache decode failed: {e}")))?;
    Ok(Some(catalog))
}

pub fn save_catalog_cache(db: &Db, fingerprint: &str, catalog: &[CatalogEntry]) -> CoreResult<()> {
    let encoded = serde_json::to_vec(catalog)
        .map_err(|e| CoreError::Internal(format!("catalog cache encode failed: {e}")))?;
    db.insert(cache_key_for(fingerprint).as_bytes(), encoded)?;
    Ok(())
}

pub fn invalidate_catalog_cache(db: &Db, fingerprint: &str) -> CoreResult<()> {
    db.remove(cache_key_for(fingerprint).as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{
        CatalogCategory, CatalogEntry, CatalogEntryKind, CatalogResolveKind,
    };

    fn sample_entry(id: &str) -> CatalogEntry {
        CatalogEntry {
            id: id.to_string(),
            namespace: "minecraft".to_string(),
            display_name: id.to_string(),
            kind: CatalogEntryKind::Block,
            source_path: format!("assets/minecraft/blockstates/{id}.json"),
            resolve_kind: CatalogResolveKind::Blockstate,
            default_variant_key: Some(String::new()),
            category: CatalogCategory::Building,
            search_tokens: vec![id.to_string()],
            texture_paths: vec![],
            icon_key: format!("minecraft:{id}:"),
            aliases: vec![],
        }
    }

    #[test]
    fn round_trips_catalog_cache() {
        let db = sled::Config::new().temporary(true).open().expect("db");
        let catalog = vec![sample_entry("stone"), sample_entry("dirt")];
        save_catalog_cache(&db, "fp-test", &catalog).expect("save");
        let loaded = load_cached_catalog(&db, "fp-test")
            .expect("load")
            .expect("cached");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "stone");
        invalidate_catalog_cache(&db, "fp-test").expect("invalidate");
        assert!(load_cached_catalog(&db, "fp-test").expect("load").is_none());
    }
}
