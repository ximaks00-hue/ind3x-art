use std::collections::HashMap;

use crate::dto::{AssetEntry, AssetKind};
use crate::source::AssetSource;

#[derive(Debug, Clone, Default)]
pub struct LangIndex {
    entries: HashMap<String, String>,
}

impl LangIndex {
    pub fn resolve_block(&self, namespace: &str, block_name: &str) -> Option<String> {
        self.entries
            .get(&format!("block.{namespace}.{block_name}"))
            .cloned()
    }

    pub fn resolve_item(&self, namespace: &str, item_name: &str) -> Option<String> {
        self.entries
            .get(&format!("item.{namespace}.{item_name}"))
            .cloned()
    }

    pub fn from_map(map: HashMap<String, String>) -> Self {
        Self { entries: map }
    }
}

pub fn parse_lang_json(content: &str) -> HashMap<String, String> {
    serde_json::from_str(content).unwrap_or_default()
}

/// Prefer `en_us.json`, then any `en_*.json`, then first lang file.
pub fn build_lang_index(entries: &[AssetEntry], source: Option<&dyn AssetSource>) -> LangIndex {
    let lang_paths: Vec<&AssetEntry> = entries
        .iter()
        .filter(|e| e.kind == AssetKind::Lang)
        .collect();

    let preferred = lang_paths
        .iter()
        .find(|e| e.path.ends_with("/lang/en_us.json"))
        .or_else(|| {
            lang_paths
                .iter()
                .find(|e| e.path.contains("/lang/en_"))
        })
        .or_else(|| lang_paths.first());

    let Some(lang_entry) = preferred else {
        return LangIndex::default();
    };

    let Some(source) = source else {
        return LangIndex::default();
    };

    let content = source.read(&lang_entry.path).ok();
    let map = content
        .as_ref()
        .map(|bytes| parse_lang_json(&String::from_utf8_lossy(bytes)))
        .unwrap_or_default();
    LangIndex::from_map(map)
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
    use super::*;

    #[test]
    fn parses_lang_keys() {
        let map = parse_lang_json(r#"{ "block.minecraft.stone": "Stone" }"#);
        let lang = LangIndex::from_map(map);
        assert_eq!(lang.resolve_block("minecraft", "stone"), Some("Stone".to_string()));
    }

    #[test]
    fn humanize_stem() {
        assert_eq!(humanize_id("grass_block"), "Grass Block");
    }
}
