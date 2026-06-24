use sled::Db;

use crate::error::{CoreError, CoreResult};

const CACHE_PREFIX: &str = "catalog-icon:v1:";
/// Max base64 payload stored per icon in sled.
pub const MAX_ICON_CACHE_BASE64_BYTES: usize = 256 * 1024;

pub fn cache_key_for(fingerprint: &str, icon_key: &str) -> String {
    format!("{CACHE_PREFIX}{fingerprint}:{icon_key}")
}

pub fn load_cached_icon(db: &Db, fingerprint: &str, icon_key: &str) -> CoreResult<Option<String>> {
    let key = cache_key_for(fingerprint, icon_key);
    let Some(bytes) = db.get(key.as_bytes())? else {
        return Ok(None);
    };
    let png_base64 = String::from_utf8(bytes.to_vec())
        .map_err(|e| CoreError::Internal(format!("icon cache decode failed: {e}")))?;
    Ok(Some(png_base64))
}

pub fn save_cached_icon(
    db: &Db,
    fingerprint: &str,
    icon_key: &str,
    png_base64: &str,
) -> CoreResult<()> {
    if png_base64.len() > MAX_ICON_CACHE_BASE64_BYTES {
        return Err(CoreError::InvalidInput(format!(
            "icon cache payload exceeds max length of {MAX_ICON_CACHE_BASE64_BYTES} bytes"
        )));
    }
    db.insert(
        cache_key_for(fingerprint, icon_key).as_bytes(),
        png_base64.as_bytes(),
    )?;
    Ok(())
}

pub fn invalidate_icon_cache_prefix(db: &Db, fingerprint: &str) -> CoreResult<()> {
    let prefix = format!("{CACHE_PREFIX}{fingerprint}:");
    for item in db.scan_prefix(prefix.as_bytes()) {
        let (key, _) = item?;
        db.remove(key)?;
    }
    Ok(())
}

pub fn invalidate_icon_cache_keys(db: &Db, fingerprint: &str, icon_keys: &[String]) -> CoreResult<()> {
    for icon_key in icon_keys {
        db.remove(cache_key_for(fingerprint, icon_key).as_bytes())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;

    #[test]
    fn rejects_oversized_icon_cache_payload() {
        let db = sled::Config::new().temporary(true).open().expect("db");
        let huge = "A".repeat(super::MAX_ICON_CACHE_BASE64_BYTES + 1);
        let err = save_cached_icon(&db, "fp", "minecraft:stone:", &huge).expect_err("oversized");
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn round_trips_icon_png_base64() {
        let db = sled::Config::new().temporary(true).open().expect("db");
        let payload = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        save_cached_icon(&db, "fp", "minecraft:stone:", payload).expect("save");
        let loaded = load_cached_icon(&db, "fp", "minecraft:stone:")
            .expect("load")
            .expect("cached");
        assert_eq!(loaded, payload);
        invalidate_icon_cache_prefix(&db, "fp").expect("invalidate");
        assert!(load_cached_icon(&db, "fp", "minecraft:stone:")
            .expect("load")
            .is_none());
    }
}
