use crate::dto::{CatalogCategory, CatalogEntryKind, CatalogPresentation};



/// Heuristic Creative-like tab assignment (v1). First matching rule wins.

pub fn categorize(id: &str, source_path: &str, kind: CatalogEntryKind) -> CatalogCategory {

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

        "berry", "stew", "soup", "fish", "salmon", "cod", "honey", "cake", "pie", "mutton",

        "rabbit", "beetroot", "chorus_fruit", "golden_apple", "enchanted_golden_apple",

    ];

    FOOD.iter().any(|k| hay.contains(k))

}



fn is_tool(hay: &str, kind: CatalogEntryKind) -> bool {

    if matches!(kind, CatalogEntryKind::Item) {

        const TOOLS: &[&str] = &[

            "sword", "pickaxe", "axe", "shovel", "hoe", "bow", "crossbow", "trident", "mace",

            "helmet", "chestplate", "leggings", "boots", "shield", "fishing_rod", "shears",

            "flint_and_steel", "spyglass", "brush",

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

        "pressure_plate", "detector", "dispenser", "dropper", "hopper", "target", "sculk_sensor",

        "daylight_detector", "note_block", "rail", "powered_rail", "activator_rail",

    ];

    KEYS.iter().any(|k| hay.contains(k))

}



fn is_nature(hay: &str) -> bool {

    const KEYS: &[&str] = &[

        "log", "leaves", "sapling", "grass_block", "short_grass", "tall_grass", "dirt", "sand",

        "gravel", "coral", "flower", "mushroom", "vine", "moss", "bamboo", "kelp", "seagrass",

        "snow", "ice", "mud", "root", "azalea", "mangrove", "cherry", "pale_moss",

    ];

    KEYS.iter().any(|k| hay.contains(k))

}



fn is_decoration(hay: &str) -> bool {

    const KEYS: &[&str] = &[

        "glass", "banner", "candle", "flower_pot", "carpet", "wool", "terracotta", "glazed",

        "painting", "frame", "lantern", "torch", "chain", "fence", "wall", "sign", "bell",

        "lectern", "armor_stand", "skull", "head", "pot", "rod", "coral_fan",

    ];

    KEYS.iter().any(|k| hay.contains(k))

}



fn is_building(hay: &str, kind: CatalogEntryKind) -> bool {

    const KEYS: &[&str] = &[

        "stone", "cobble", "brick", "concrete", "andesite", "diorite", "granite", "deepslate",

        "copper", "iron_block", "gold_block", "planks", "slab", "stairs", "ore", "block",

        "obsidian", "netherrack", "basalt", "blackstone", "prismarine", "quartz", "table",

    ];

    if KEYS.iter().any(|k| hay.contains(k)) {

        return true;

    }

    matches!(kind, CatalogEntryKind::Block)

}



pub fn presentation_for(

    _id: &str,

    _source_path: &str,

    kind: CatalogEntryKind,

    category: CatalogCategory,

) -> CatalogPresentation {

    match kind {

        CatalogEntryKind::Block => CatalogPresentation::Block,

        CatalogEntryKind::Item => {

            if category == CatalogCategory::Food {

                CatalogPresentation::Food

            } else if category == CatalogCategory::Tools {

                CatalogPresentation::Tool

            } else {

                CatalogPresentation::Item

            }

        }

    }

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



    #[test]

    fn categorizes_decoration_torch() {

        assert_eq!(

            categorize("minecraft:torch", "assets/minecraft/blockstates/torch.json", CatalogEntryKind::Block),

            CatalogCategory::Decoration

        );

    }



    #[test]

    fn categorizes_building_cobblestone() {

        assert_eq!(

            categorize("minecraft:cobblestone", "assets/minecraft/blockstates/cobblestone.json", CatalogEntryKind::Block),

            CatalogCategory::Building

        );

    }

}



