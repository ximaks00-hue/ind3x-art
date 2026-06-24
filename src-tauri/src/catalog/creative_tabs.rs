use std::collections::HashMap;

use serde::Deserialize;

use crate::dto::CatalogCategory;
use crate::source::AssetSource;

/// Optional per-pack (or builtin) creative tab ordering for catalog queries.
#[derive(Debug, Clone, Default)]
pub struct CreativeTabOrder {
    rank: HashMap<String, u32>,
}

#[derive(Debug, Deserialize)]
struct CreativeTabsFile {
    #[serde(flatten)]
    tabs: HashMap<String, Vec<String>>,
}

const TAB_PATHS: &[&str] = &["creative_tabs.json", "assets/ind3x/creative_tabs.json"];

/// Builtin vanilla-adjacent order used when the pack has no `creative_tabs.json`.
fn builtin_tabs() -> CreativeTabsFile {
    CreativeTabsFile {
        tabs: HashMap::from([
            (
                "building".to_string(),
                vec![
                    "minecraft:stone".to_string(),
                    "minecraft:cobblestone".to_string(),
                    "minecraft:oak_planks".to_string(),
                    "minecraft:bricks".to_string(),
                    "minecraft:glass".to_string(),
                    "minecraft:test_stone".to_string(),
                    "minecraft:demo_grass".to_string(),
                    "minecraft:demo_oak_log".to_string(),
                    "minecraft:demo_crafting_table".to_string(),
                ],
            ),
            (
                "decoration".to_string(),
                vec![
                    "minecraft:torch".to_string(),
                    "minecraft:demo_torch".to_string(),
                    "minecraft:flower_pot".to_string(),
                ],
            ),
            (
                "tools".to_string(),
                vec![
                    "minecraft:diamond_sword".to_string(),
                    "minecraft:iron_pickaxe".to_string(),
                ],
            ),
        ]),
    }
}

pub fn load_creative_tabs(source: &dyn AssetSource) -> CreativeTabOrder {
    for path in TAB_PATHS {
        if let Ok(bytes) = source.read(path) {
            match serde_json::from_slice::<CreativeTabsFile>(&bytes) {
                Ok(file) => return order_from_file(file),
                Err(e) => tracing::warn!(path, error = %e, "invalid creative_tabs.json"),
            }
        }
    }
    order_from_file(builtin_tabs())
}

fn order_from_file(file: CreativeTabsFile) -> CreativeTabOrder {
    let mut rank = HashMap::new();
    let mut index: u32 = 0;
    for category in category_tab_order() {
        if let Some(ids) = file.tabs.get(category) {
            for id in ids {
                rank.entry(id.clone()).or_insert_with(|| {
                    let r = index;
                    index += 1;
                    r
                });
            }
        }
    }
    for ids in file.tabs.values() {
        for id in ids {
            rank.entry(id.clone()).or_insert_with(|| {
                let r = index;
                index += 1;
                r
            });
        }
    }
    CreativeTabOrder { rank }
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

impl CreativeTabOrder {
    pub fn sort_key(&self, entry_id: &str, display_name: &str) -> (u32, String) {
        match self.rank.get(entry_id) {
            Some(rank) => (*rank, display_name.to_lowercase()),
            None => (u32::MAX / 2, display_name.to_lowercase()),
        }
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
    fn pack_tabs_define_rank() {
        let file = CreativeTabsFile {
            tabs: HashMap::from([(
                "building".to_string(),
                vec!["minecraft:stone".to_string(), "minecraft:dirt".to_string()],
            )]),
        };
        let order = order_from_file(file);
        assert!(order.rank.get("minecraft:stone").unwrap() < order.rank.get("minecraft:dirt").unwrap());
    }
}
