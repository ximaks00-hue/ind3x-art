use std::collections::HashSet;

use crate::dto::{CatalogEntry, CatalogEntryKind};

/// When a block and item share the same id stem, keep the block entry and merge item as alias.
pub fn dedup_catalog(mut entries: Vec<CatalogEntry>) -> Vec<CatalogEntry> {
    let input_len = entries.len();
    let block_ids: HashSet<String> = entries
        .iter()
        .filter(|e| e.kind == CatalogEntryKind::Block)
        .map(|e| e.id.clone())
        .collect();

    let mut merged: Vec<CatalogEntry> = Vec::new();
    for entry in entries.drain(..) {
        if entry.kind == CatalogEntryKind::Item && block_ids.contains(&entry.id) {
            if let Some(block) = merged.iter_mut().find(|e| e.id == entry.id) {
                if !block.aliases.contains(&entry.source_path) {
                    block.aliases.push(entry.source_path);
                }
                continue;
            }
        }
        merged.push(entry);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{CatalogCategory, CatalogResolveKind};

    fn sample(id: &str, kind: CatalogEntryKind, path: &str) -> CatalogEntry {
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
        assert!(out[0].aliases.iter().any(|a| a.contains("models/item")));
    }
}
