use crate::dto::CatalogCategory;

/// Heuristic Creative-like tab assignment (v1). First matching rule wins.
pub fn categorize(id: &str, source_path: &str, kind: crate::dto::CatalogEntryKind) -> CatalogCategory {
    let hay = format!("{id} {source_path}").to_ascii_lowercase();

    if is_food(&hay) {
        return CatalogCategory::Food;
    }
    if is_tool(&hay, kind) {
        return CatalogCategory::Tools;
    }
    if is_redstone(&hay) {
        return CatalogCategory::Redstone;
    }
    if is_nature(&hay) {
        return CatalogCategory::Nature;
    }
    if is_decoration(&hay) {
        return CatalogCategory::Decoration;
    }
    if is_building(&hay, kind) {
        return CatalogCategory::Building;
    }
    CatalogCategory::Misc
}

fn is_food(hay: &str) -> bool {
    const FOOD: &[&str] = &[
        "apple", "bread", "beef", "pork", "chicken", "carrot", "potato", "cookie", "melon",
        "berry", "stew", "soup", "fish", "salmon", "cod", "honey", "cake", "pie",
    ];
    FOOD.iter().any(|k| hay.contains(k))
}

fn is_tool(hay: &str, kind: crate::dto::CatalogEntryKind) -> bool {
    if matches!(kind, crate::dto::CatalogEntryKind::Item) {
        const TOOLS: &[&str] = &[
            "sword", "pickaxe", "axe", "shovel", "hoe", "bow", "crossbow", "trident",
            "helmet", "chestplate", "leggings", "boots", "shield", "fishing_rod",
        ];
        if TOOLS.iter().any(|k| hay.contains(k)) {
            return true;
        }
    }
    hay.contains("/item/") && hay.contains("tool")
}

fn is_redstone(hay: &str) -> bool {
    const KEYS: &[&str] = &[
        "redstone", "piston", "repeater", "comparator", "observer", "lever", "button",
        "pressure_plate", "detector", "dispenser", "dropper", "hopper", "target",
    ];
    KEYS.iter().any(|k| hay.contains(k))
}

fn is_nature(hay: &str) -> bool {
    const KEYS: &[&str] = &[
        "log", "leaves", "sapling", "grass", "dirt", "sand", "gravel", "coral", "flower",
        "mushroom", "vine", "moss", "bamboo", "kelp", "seagrass", "snow", "ice",
    ];
    KEYS.iter().any(|k| hay.contains(k))
}

fn is_decoration(hay: &str) -> bool {
    const KEYS: &[&str] = &[
        "glass", "banner", "candle", "flower_pot", "carpet", "wool", "terracotta",
        "glazed", "painting", "frame", "lantern", "torch", "chain", "fence", "wall",
    ];
    KEYS.iter().any(|k| hay.contains(k))
}

fn is_building(hay: &str, kind: crate::dto::CatalogEntryKind) -> bool {
    if matches!(kind, crate::dto::CatalogEntryKind::Block) {
        return true;
    }
    const KEYS: &[&str] = &[
        "stone", "brick", "concrete", "andesite", "diorite", "granite", "deepslate",
        "copper", "iron_block", "gold_block",
    ];
    KEYS.iter().any(|k| hay.contains(k))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::CatalogEntryKind;

    #[test]
    fn categorizes_nature_grass() {
        assert_eq!(
            categorize("minecraft:grass_block", "assets/minecraft/blockstates/grass_block.json", CatalogEntryKind::Block),
            CatalogCategory::Nature
        );
    }

    #[test]
    fn categorizes_tools_sword() {
        assert_eq!(
            categorize(
                "minecraft:diamond_sword",
                "assets/minecraft/models/item/diamond_sword.json",
                CatalogEntryKind::Item
            ),
            CatalogCategory::Tools
        );
    }

    #[test]
    fn categorizes_redstone() {
        assert_eq!(
            categorize("minecraft:redstone_wire", "assets/minecraft/blockstates/redstone_wire.json", CatalogEntryKind::Block),
            CatalogCategory::Redstone
        );
    }
}
