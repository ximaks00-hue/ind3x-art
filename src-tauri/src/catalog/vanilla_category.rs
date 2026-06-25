use std::collections::HashMap;
use std::sync::OnceLock;

use crate::dto::{CatalogCategory, CatalogEntryKind};

#[derive(serde::Deserialize)]
struct VanillaCategoryFile {
    blocks: HashMap<String, String>,
    items: HashMap<String, String>,
}

fn file() -> &'static VanillaCategoryFile {
    static DATA: OnceLock<VanillaCategoryFile> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!("../../assets/vanilla_lang/creative_categories.json"))
            .expect("vanilla creative_categories.json")
    })
}

fn parse_category(name: &str) -> Option<CatalogCategory> {
    match name {
        "building" => Some(CatalogCategory::Building),
        "decoration" => Some(CatalogCategory::Decoration),
        "redstone" => Some(CatalogCategory::Redstone),
        "nature" => Some(CatalogCategory::Nature),
        "tools" => Some(CatalogCategory::Tools),
        "food" => Some(CatalogCategory::Food),
        "misc" => Some(CatalogCategory::Misc),
        _ => None,
    }
}

/// Vanilla creative-tab mapping for `minecraft:` ids (1.19+ tab groups, simplified).
pub fn category_for(stem: &str, kind: CatalogEntryKind) -> Option<CatalogCategory> {
    let data = file();
    let tab = match kind {
        CatalogEntryKind::Block => data.blocks.get(stem),
        CatalogEntryKind::Item => data.items.get(stem),
    }?;
    parse_category(tab.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_grass_block_to_nature() {
        assert_eq!(
            category_for("grass_block", CatalogEntryKind::Block),
            Some(CatalogCategory::Nature)
        );
    }

    #[test]
    fn maps_diamond_sword_to_tools() {
        assert_eq!(
            category_for("diamond_sword", CatalogEntryKind::Item),
            Some(CatalogCategory::Tools)
        );
    }
}
