use std::collections::HashMap;

use crate::dto::{CatalogEntry, CatalogEntryKind};

/// When a block and item share the same id stem, keep the block entry and merge item metadata.
pub fn dedup_catalog(mut entries: Vec<CatalogEntry>) -> Vec<CatalogEntry> {
    let input_len = entries.len();

    let mut blocks: HashMap<String, CatalogEntry> = HashMap::new();
    let mut items: Vec<CatalogEntry> = Vec::new();

    for entry in entries.drain(..) {
        match entry.kind {
            CatalogEntryKind::Block => {
                blocks.insert(entry.id.clone(), entry);
            }
            CatalogEntryKind::Item => {
                items.push(entry);
            }
        }
    }

    let mut orphan_items: Vec<CatalogEntry> = Vec::new();
    for item in items {
        if let Some(block) = blocks.get_mut(&item.id) {
            merge_item_into_block(block, &item);
        } else {
            orphan_items.push(item);
        }
    }

    let mut merged: Vec<CatalogEntry> = blocks.into_values().collect();
    merged.append(&mut orphan_items);
    merged.sort_by(|a, b| a.display_name.cmp(&b.display_name).then_with(|| a.id.cmp(&b.id)));
    let collapsed = input_len.saturating_sub(merged.len());
    if collapsed > 0 {
        tracing::debug!(
            catalog_dedup_collapsed = collapsed,
            catalog_dedup_remaining = merged.len(),
            "catalog dedup merged duplicate block/item ids"
        );
    }
    merged
}

fn merge_item_into_block(block: &mut CatalogEntry, item: &CatalogEntry) {
    block.item_id = item.item_id.clone().or_else(|| Some(item.id.clone()));
    if let Some(ref icon_path) = item.icon_model_path {
        block.icon_model_path = Some(icon_path.clone());
    } else {
        block.icon_model_path = Some(item.source_path.clone());
    }
    if !block.aliases.iter().any(|a| a == &item.source_path) {
        block.aliases.push(item.source_path.clone());
    }
    if let Some(ref item_id) = block.item_id {
        let token = item_id.to_lowercase();
        if !block.search_tokens.iter().any(|t| t == &token) {
            block.search_tokens.push(token);
            block.search_tokens.sort();
        }
    }
    if block.block_id.is_none() {
        block.block_id = Some(block.id.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{CatalogCategory, CatalogPresentation, CatalogResolveKind};

    fn sample(id: &str, kind: CatalogEntryKind, path: &str) -> CatalogEntry {
        let studio = path.to_string();
        CatalogEntry {
            id: id.to_string(),
            namespace: "minecraft".to_string(),
            display_name: id.to_string(),
            kind,
            source_path: path.to_string(),
            resolve_kind: CatalogResolveKind::Blockstate,
            default_variant_key: None,
            category: CatalogCategory::Building,
            search_tokens: vec![id.to_string()],
            texture_paths: vec![],
            icon_key: format!("minecraft:{id}:"),
            aliases: vec![],
            block_id: if kind == CatalogEntryKind::Block {
                Some(id.to_string())
            } else {
                None
            },
            item_id: if kind == CatalogEntryKind::Item {
                Some(id.to_string())
            } else {
                None
            },
            icon_model_path: if kind == CatalogEntryKind::Item {
                Some(path.to_string())
            } else {
                None
            },
            studio_model_path: studio,
            variant_keys: vec![],
            presentation: if kind == CatalogEntryKind::Block {
                CatalogPresentation::Block
            } else {
                CatalogPresentation::Item
            },
        }
    }

    #[test]
    fn merges_item_into_block_alias() {
        let entries = vec![
            sample("minecraft:stone", CatalogEntryKind::Block, "assets/minecraft/blockstates/stone.json"),
            sample("minecraft:stone", CatalogEntryKind::Item, "assets/minecraft/models/item/stone.json"),
        ];
        let out = dedup_catalog(entries);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, CatalogEntryKind::Block);
        assert_eq!(out[0].item_id.as_deref(), Some("minecraft:stone"));
        assert!(out[0].aliases.iter().any(|a| a.contains("models/item")));
        assert!(out[0]
            .icon_model_path
            .as_deref()
            .is_some_and(|p| p.contains("models/item")));
    }

    #[test]
    fn item_before_block_preserves_block_metadata() {
        // RUST-001 regression: item-first input must not replace the block row.
        let block_path = "assets/minecraft/blockstates/stone.json";
        let item_path = "assets/minecraft/models/item/stone.json";
        let entries = vec![
            sample("minecraft:stone", CatalogEntryKind::Item, item_path),
            sample("minecraft:stone", CatalogEntryKind::Block, block_path),
        ];
        let out = dedup_catalog(entries);
        assert_eq!(out.len(), 1, "block+item with same id must collapse to one row");
        let merged = &out[0];
        assert_eq!(merged.kind, CatalogEntryKind::Block);
        assert_eq!(merged.source_path, block_path);
        assert_eq!(merged.studio_model_path, block_path);
        assert_eq!(merged.resolve_kind, CatalogResolveKind::Blockstate);
        assert_eq!(merged.presentation, CatalogPresentation::Block);
        assert_eq!(merged.block_id.as_deref(), Some("minecraft:stone"));
        assert_eq!(merged.item_id.as_deref(), Some("minecraft:stone"));
        assert!(merged.aliases.iter().any(|a| a == item_path));
        assert_eq!(merged.icon_model_path.as_deref(), Some(item_path));
    }

    #[test]
    fn merges_item_into_block_when_item_comes_first() {
        let entries = vec![
            sample("minecraft:stone", CatalogEntryKind::Item, "assets/minecraft/models/item/stone.json"),
            sample("minecraft:stone", CatalogEntryKind::Block, "assets/minecraft/blockstates/stone.json"),
        ];
        let out = dedup_catalog(entries);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, CatalogEntryKind::Block);
        assert_eq!(out[0].item_id.as_deref(), Some("minecraft:stone"));
        assert!(out[0].aliases.iter().any(|a| a.contains("models/item")));
    }
}
