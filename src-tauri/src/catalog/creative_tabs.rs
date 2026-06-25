use std::collections::HashMap;

use serde::Deserialize;

use crate::dto::CatalogCategory;
use crate::source::AssetSource;

/// Per-pack creative tab ordering and id → category mapping from `creative_tabs.json`.
#[derive(Debug, Clone, Default)]
pub struct CreativeTabOrder {
    rank: HashMap<String, u32>,
    categories: HashMap<String, CatalogCategory>,
}

#[derive(Debug, Deserialize)]
struct CreativeTabsFile {
    #[serde(flatten)]
    tabs: HashMap<String, Vec<String>>,
}

#[derive(Deserialize)]
struct VanillaCategoryFile {
    blocks: HashMap<String, String>,
    items: HashMap<String, String>,
}

const TAB_PATHS: &[&str] = &["creative_tabs.json", "assets/ind3x/creative_tabs.json"];

pub fn parse_tab_category(name: &str) -> Option<CatalogCategory> {
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

fn category_tab_order() -> [&'static str; 7] {
    [
        "building",
        "decoration",
        "redstone",
        "nature",
        "tools",
        "food",
        "misc",
    ]
}

fn vanilla_category_file() -> VanillaCategoryFile {
    serde_json::from_str(include_str!("../../assets/vanilla_lang/creative_categories.json"))
        .expect("vanilla creative_categories.json")
}

/// Builtin vanilla id → tab mapping derived from `creative_categories.json`.
fn builtin_order() -> CreativeTabOrder {
    let data = vanilla_category_file();
    let mut tabs: HashMap<String, Vec<String>> = HashMap::new();
    for (stem, tab) in data.blocks {
        tabs.entry(tab).or_default().push(format!("minecraft:{stem}"));
    }
    for (stem, tab) in data.items {
        tabs.entry(tab).or_default().push(format!("minecraft:{stem}"));
    }
    let file = CreativeTabsFile { tabs };
    let mut order = CreativeTabOrder::default();
    merge_file(&mut order, &file, true);
    order
}

fn merge_file(order: &mut CreativeTabOrder, file: &CreativeTabsFile, override_categories: bool) {
    let mut index = order.next_rank();
    for tab_name in category_tab_order() {
        if let Some(ids) = file.tabs.get(tab_name) {
            apply_tab(order, tab_name, ids, &mut index, override_categories);
        }
    }
    for (tab_name, ids) in &file.tabs {
        if category_tab_order().contains(&tab_name.as_str()) {
            continue;
        }
        apply_tab(order, tab_name, ids, &mut index, override_categories);
    }
}

fn apply_tab(
    order: &mut CreativeTabOrder,
    tab_name: &str,
    ids: &[String],
    index: &mut u32,
    override_categories: bool,
) {
    let Some(category) = parse_tab_category(tab_name) else {
        return;
    };
    for id in ids {
        if override_categories || !order.categories.contains_key(id) {
            order.categories.insert(id.clone(), category);
        }
        order.rank.entry(id.clone()).or_insert_with(|| {
            let rank = *index;
            *index += 1;
            rank
        });
    }
}

pub fn load_creative_tabs(source: &dyn AssetSource) -> CreativeTabOrder {
    let mut order = builtin_order();
    for path in TAB_PATHS {
        if let Ok(bytes) = source.read(path) {
            match serde_json::from_slice::<CreativeTabsFile>(&bytes) {
                Ok(file) => {
                    merge_file(&mut order, &file, true);
                }
                Err(e) => tracing::warn!(path, error = %e, "invalid creative_tabs.json"),
            }
        }
    }
    order
}

impl CreativeTabOrder {
    pub fn category_for(&self, entry_id: &str) -> Option<CatalogCategory> {
        self.categories.get(entry_id).copied()
    }

    pub fn sort_key(&self, entry_id: &str, display_name: &str) -> (u32, String) {
        match self.rank.get(entry_id) {
            Some(rank) => (*rank, display_name.to_lowercase()),
            None => (u32::MAX / 2, display_name.to_lowercase()),
        }
    }

    fn next_rank(&self) -> u32 {
        self.rank.values().copied().max().map(|m| m + 1).unwrap_or(0)
    }

    #[allow(dead_code)]
    pub fn category_sort_key(category: CatalogCategory) -> u8 {
        match category {
            CatalogCategory::Building => 0,
            CatalogCategory::Decoration => 1,
            CatalogCategory::Redstone => 2,
            CatalogCategory::Nature => 3,
            CatalogCategory::Tools => 4,
            CatalogCategory::Food => 5,
            CatalogCategory::Misc => 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_tab_assigns_category_and_rank() {
        let file = CreativeTabsFile {
            tabs: HashMap::from([(
                "decoration".to_string(),
                vec![
                    "minecraft:demo_torch".to_string(),
                    "mymod:glow_panel".to_string(),
                ],
            )]),
        };
        let mut order = CreativeTabOrder::default();
        merge_file(&mut order, &file, true);
        assert_eq!(
            order.category_for("minecraft:demo_torch"),
            Some(CatalogCategory::Decoration)
        );
        assert_eq!(
            order.category_for("mymod:glow_panel"),
            Some(CatalogCategory::Decoration)
        );
        assert!(order.rank.get("minecraft:demo_torch").unwrap() < order.rank.get("mymod:glow_panel").unwrap());
    }

    #[test]
    fn builtin_maps_vanilla_stone_to_building() {
        let order = builtin_order();
        assert_eq!(
            order.category_for("minecraft:stone"),
            Some(CatalogCategory::Building)
        );
    }

    #[test]
    fn pack_tabs_define_rank() {
        let file = CreativeTabsFile {
            tabs: HashMap::from([(
                "building".to_string(),
                vec!["minecraft:stone".to_string(), "minecraft:dirt".to_string()],
            )]),
        };
        let mut order = CreativeTabOrder::default();
        merge_file(&mut order, &file, true);
        assert!(order.rank.get("minecraft:stone").unwrap() < order.rank.get("minecraft:dirt").unwrap());
    }
}
