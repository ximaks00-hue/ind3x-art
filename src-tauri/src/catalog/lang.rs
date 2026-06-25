use std::collections::{HashMap, HashSet};

use crate::dto::{AssetEntry, AssetKind, CatalogEntryKind};
use crate::source::AssetSource;

#[derive(Debug, Clone, Default)]
pub struct LangResolver {
    /// locale id (e.g. `en_us`) → flat lang key → display string
    by_locale: HashMap<String, HashMap<String, String>>,
    /// Sorted for stable fallback (en_us, en_gb, … then rest)
    available_locales: Vec<String>,
}

impl LangResolver {
    pub fn resolve_block(
        &self,
        preferred: &str,
        namespace: &str,
        block_name: &str,
    ) -> Option<String> {
        self.resolve_key(preferred, &format!("block.{namespace}.{block_name}"))
    }

    pub fn resolve_item(
        &self,
        preferred: &str,
        namespace: &str,
        item_name: &str,
    ) -> Option<String> {
        self.resolve_key(preferred, &format!("item.{namespace}.{item_name}"))
    }

    pub fn resolve_display_name(
        &self,
        preferred: &str,
        kind: CatalogEntryKind,
        namespace: &str,
        stem: &str,
    ) -> Option<String> {
        match kind {
            CatalogEntryKind::Block => self.resolve_block(preferred, namespace, stem),
            CatalogEntryKind::Item => self.resolve_item(preferred, namespace, stem),
        }
    }

    #[allow(dead_code)]
    pub fn available_locales(&self) -> &[String] {
        &self.available_locales
    }

    fn resolve_key(&self, preferred: &str, key: &str) -> Option<String> {
        for locale in locale_chain(preferred, &self.available_locales) {
            if let Some(map) = self.by_locale.get(&locale) {
                if let Some(value) = map.get(key) {
                    return Some(value.clone());
                }
            }
            if let Some(value) = super::vanilla_lang::resolve_key(&locale, key) {
                return Some(value);
            }
        }
        None
    }
}

/// Locale fallback: preferred → en_us → en_gb → first available.
fn locale_chain(preferred: &str, available: &[String]) -> Vec<String> {
    let mut chain = Vec::new();
    let preferred = preferred.trim();
    if !preferred.is_empty() {
        chain.push(preferred.to_string());
    }
    for fallback in ["en_us", "en_gb"] {
        if !chain.iter().any(|l| l == fallback) {
            chain.push(fallback.to_string());
        }
    }
    for locale in available {
        if !chain.iter().any(|l| l == locale) {
            chain.push(locale.clone());
        }
    }
    chain
}

pub fn parse_lang_json(content: &str) -> HashMap<String, String> {
    match serde_json::from_str(content) {
        Ok(map) => map,
        Err(e) => {
            tracing::warn!(error = %e, "failed to parse lang json");
            HashMap::new()
        }
    }
}

/// Parse every `assets/*/lang/*.json` into a merged per-locale index (namespace-aware keys).
pub fn build_lang_resolver(entries: &[AssetEntry], source: Option<&dyn AssetSource>) -> LangResolver {
    let lang_paths: Vec<&AssetEntry> = entries
        .iter()
        .filter(|e| e.kind == AssetKind::Lang)
        .collect();

    let Some(source) = source else {
        return LangResolver::default();
    };

    let mut by_locale: HashMap<String, HashMap<String, String>> = HashMap::new();
    for entry in lang_paths {
        let Some(locale) = locale_from_lang_path(&entry.path) else {
            continue;
        };
        let content = match source.read(&entry.path) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::warn!(path = %entry.path, error = %e, "failed to read lang file");
                continue;
            }
        };
        let map = parse_lang_json(&String::from_utf8_lossy(&content));
        by_locale
            .entry(locale)
            .or_default()
            .extend(map);
    }

    let mut available_locales: Vec<String> = by_locale.keys().cloned().collect();
    available_locales.sort();

    LangResolver {
        by_locale,
        available_locales,
    }
}

fn locale_from_lang_path(path: &str) -> Option<String> {
    // assets/{namespace}/lang/{locale}.json
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 4 {
        return None;
    }
    let filename = parts.last()?;
    let stem = filename.strip_suffix(".json")?;
    for prefix in [
        "blocks_",
        "items_",
        "crops_",
        "advancements_",
        "probe_",
    ] {
        if let Some(rest) = stem.strip_prefix(prefix) {
            return Some(rest.to_string());
        }
    }
    Some(stem.to_string())
}

#[derive(Debug, Clone)]
pub struct LangCatalogSeed {
    pub kind: CatalogEntryKind,
    pub namespace: String,
    pub stem: String,
    #[allow(dead_code)]
    pub display_name: String,
}

impl LangResolver {
    pub fn catalog_lang_entries(&self, preferred: &str) -> Vec<LangCatalogSeed> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for locale in locale_chain(preferred, &self.available_locales) {
            let Some(map) = self.by_locale.get(&locale) else {
                continue;
            };
            for (key, display) in map {
                let Some((kind, namespace, stem)) = parse_lang_catalog_key(key) else {
                    continue;
                };
                let id = format!("{namespace}:{stem}");
                if seen.insert(id) {
                    out.push(LangCatalogSeed {
                        kind,
                        namespace,
                        stem,
                        display_name: display.clone(),
                    });
                }
            }
        }
        out
    }
}

fn parse_lang_catalog_key(key: &str) -> Option<(CatalogEntryKind, String, String)> {
    let mut parts = key.splitn(3, '.');
    let prefix = parts.next()?;
    let kind = match prefix {
        "block" => CatalogEntryKind::Block,
        "item" => CatalogEntryKind::Item,
        _ => return None,
    };
    let namespace = parts.next()?.to_string();
    let stem = parts.next()?.to_string();
    if stem.is_empty() {
        return None;
    }
    Some((kind, namespace, stem))
}

pub fn humanize_id(stem: &str) -> String {
    stem.split('_')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::index::classify::classify_path;
    use crate::source::FolderSource;

    use super::*;

    #[test]
    fn parses_lang_keys() {
        let map = parse_lang_json(r#"{ "block.minecraft.stone": "Stone" }"#);
        let mut resolver = LangResolver::default();
        resolver.by_locale.insert("en_us".to_string(), map);
        resolver.available_locales = vec!["en_us".to_string()];
        assert_eq!(
            resolver.resolve_block("en_us", "minecraft", "stone"),
            Some("Stone".to_string())
        );
    }

    #[test]
    fn humanize_stem() {
        assert_eq!(humanize_id("grass_block"), "Grass Block");
    }

    #[test]
    fn locale_chain_prefers_settings_then_en_us() {
        let chain = locale_chain("ru_ru", &["de_de".to_string(), "en_us".to_string()]);
        assert_eq!(chain[0], "ru_ru");
        assert_eq!(chain[1], "en_us");
        assert!(chain.contains(&"en_gb".to_string()));
    }

    #[test]
    fn split_lang_files_merge_into_locale() {
        let map = parse_lang_json(r#"{ "block.ic2.batbox": "BatBox" }"#);
        let mut resolver = LangResolver::default();
        resolver.by_locale.insert("en_us".to_string(), map);
        resolver.available_locales = vec!["en_us".to_string()];
        let entries = resolver.catalog_lang_entries("en_us");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].stem, "batbox");
        assert_eq!(entries[0].display_name, "BatBox");
    }

    #[test]
    fn vanilla_lang_fills_missing_pack_translation() {
        let resolver = LangResolver::default();
        assert_eq!(
            resolver.resolve_block("en_us", "minecraft", "stone"),
            Some("Stone".to_string())
        );
        assert_eq!(
            resolver.resolve_block("ru_ru", "minecraft", "stone"),
            Some("Камень".to_string())
        );
        assert_eq!(resolver.resolve_block("en_us", "mymod", "stone"), None);
    }

    #[test]
    fn merges_all_namespace_lang_files() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/lang_pack");
        let source = FolderSource::new(&root).expect("source");
        let entries: Vec<AssetEntry> = source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|p| classify_path(&p))
            .collect();
        let resolver = build_lang_resolver(&entries, Some(&source));

        assert!(resolver.available_locales().contains(&"en_us".to_string()));
        assert!(resolver.available_locales().contains(&"ru_ru".to_string()));
        assert_eq!(
            resolver.resolve_block("en_us", "minecraft", "test_stone"),
            Some("Test Stone".to_string())
        );
        assert_eq!(
            resolver.resolve_block("ru_ru", "minecraft", "test_stone"),
            Some("Камень".to_string())
        );
        assert_eq!(
            resolver.resolve_item("ru_ru", "minecraft", "test_sword"),
            Some("Меч".to_string())
        );
        assert_eq!(
            resolver.resolve_block("en_us", "mymod", "custom_block"),
            Some("Custom Block".to_string())
        );
        // Missing ru key falls back to en_us
        assert_eq!(
            resolver.resolve_block("ru_ru", "mymod", "custom_block"),
            Some("Custom Block".to_string())
        );
    }
}
