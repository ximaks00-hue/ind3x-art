use std::collections::HashMap;
use std::sync::Arc;

use crate::dto::{CatalogCategory, CatalogEntry, CatalogFacets, CatalogFilter, CatalogPage, FacetCount, PageReq};
use crate::search::fuzzy_score;

use super::creative_tabs::CreativeTabOrder;

pub fn query_catalog(
    entries: &[Arc<CatalogEntry>],
    filter: CatalogFilter,
    page: PageReq,
    tab_order: Option<&CreativeTabOrder>,
) -> CatalogPage {
    let search = filter
        .search
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let query_lower = search.as_ref().map(|q| q.to_lowercase());

    let mut matched: Vec<(u32, usize)> = entries
        .iter()
        .enumerate()
        .filter_map(|(idx, entry)| {
            let entry = entry.as_ref();
            if let Some(category) = filter.category {
                if entry.category != category {
                    return None;
                }
            }
            if let Some(ref ns) = filter.namespace {
                if &entry.namespace != ns {
                    return None;
                }
            }
            if let Some(ref q) = search {
                if filter.fuzzy {
                    let hay = format!(
                        "{} {} {} {}",
                        entry.display_name,
                        entry.id,
                        entry.search_tokens.join(" "),
                        entry.aliases.join(" ")
                    );
                    fuzzy_score(q, &hay).map(|score| (score, idx))
                } else if query_lower.as_ref().is_some_and(|needle| {
                    entry.display_name.to_lowercase().contains(needle)
                        || entry.id.to_lowercase().contains(needle)
                        || entry
                            .search_tokens
                            .iter()
                            .any(|t| t.contains(needle))
                        || entry
                            .aliases
                            .iter()
                            .any(|a| a.to_lowercase().contains(needle))
                }) {
                    Some((1000, idx))
                } else {
                    None
                }
            } else {
                Some((0, idx))
            }
        })
        .collect();

    if search.is_some() && filter.fuzzy {
        matched.sort_by(|a, b| {
            b.0.cmp(&a.0).then_with(|| {
                entries[a.1].id.cmp(&entries[b.1].id)
            })
        });
    } else {
        matched.sort_by(|a, b| {
            let score_cmp = if search.is_some() {
                b.0.cmp(&a.0)
            } else {
                std::cmp::Ordering::Equal
            };
            score_cmp.then_with(|| {
                let ea = entries[a.1].as_ref();
                let eb = entries[b.1].as_ref();
                let (ra, na) = tab_order
                    .map(|order| order.sort_key(&ea.id, &ea.display_name))
                    .unwrap_or((u32::MAX / 2, ea.display_name.to_lowercase()));
                let (rb, nb) = tab_order
                    .map(|order| order.sort_key(&eb.id, &eb.display_name))
                    .unwrap_or((u32::MAX / 2, eb.display_name.to_lowercase()));
                ra.cmp(&rb)
                    .then_with(|| na.cmp(&nb))
                    .then_with(|| ea.id.cmp(&eb.id))
            })
        });
    }

    let total = matched.len() as u64;
    let start = page.offset as usize;
    let page_entries: Vec<CatalogEntry> = matched
        .iter()
        .skip(start)
        .take(page.limit as usize)
        .map(|(_, idx)| entries[*idx].as_ref().clone())
        .collect();

    CatalogPage {
        entries: page_entries,
        total,
    }
}

pub fn get_catalog_entry<'a>(entries: &'a [Arc<CatalogEntry>], id: &str) -> Option<&'a CatalogEntry> {
    entries.iter().find(|e| e.id == id).map(Arc::as_ref)
}

/// O(1) lookup using a pre-built id → index map.
pub fn get_catalog_entry_indexed<'a>(
    entries: &'a [Arc<CatalogEntry>],
    id_index: &std::collections::HashMap<String, usize>,
    id: &str,
) -> Option<&'a CatalogEntry> {
    id_index.get(id).and_then(|&i| entries.get(i)).map(Arc::as_ref)
}

pub fn catalog_facets(entries: &[Arc<CatalogEntry>]) -> CatalogFacets {
    let mut counts: HashMap<CatalogCategory, u64> = HashMap::new();
    for entry in entries {
        *counts.entry(entry.category).or_insert(0) += 1;
    }
    let mut by_category: Vec<FacetCount> = counts
        .into_iter()
        .map(|(category, count)| FacetCount {
            key: category_key(category).to_string(),
            count,
        })
        .collect();
    by_category.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));
    CatalogFacets { by_category }
}

fn category_key(category: CatalogCategory) -> &'static str {
    match category {
        CatalogCategory::Building => "building",
        CatalogCategory::Nature => "nature",
        CatalogCategory::Redstone => "redstone",
        CatalogCategory::Decoration => "decoration",
        CatalogCategory::Tools => "tools",
        CatalogCategory::Food => "food",
        CatalogCategory::Misc => "misc",
    }
}

#[cfg(test)]
mod bench {
    use std::time::Instant;

    use super::*;
    use crate::dto::{
        CatalogCategory, CatalogEntry, CatalogEntryKind, CatalogFilter, CatalogPresentation,
        CatalogResolveKind, PageReq,
    };

    #[test]
    fn catalog_facets_counts_categories() {
        let catalog = vec![
            synthetic_entry(CatalogCategory::Building, "a"),
            synthetic_entry(CatalogCategory::Building, "b"),
            synthetic_entry(CatalogCategory::Nature, "c"),
        ];
        let facets = catalog_facets(&crate::state::arc_catalog(catalog));
        assert_eq!(facets.by_category.len(), 2);
        let building = facets
            .by_category
            .iter()
            .find(|f| f.key == "building")
            .expect("building facet");
        assert_eq!(building.count, 2);
    }

    fn synthetic_entry(category: CatalogCategory, stem: &str) -> CatalogEntry {
        let path = format!("assets/minecraft/blockstates/{stem}.json");
        CatalogEntry {
            id: format!("minecraft:{stem}"),
            namespace: "minecraft".to_string(),
            display_name: stem.to_string(),
            kind: CatalogEntryKind::Block,
            source_path: path.clone(),
            resolve_kind: CatalogResolveKind::Blockstate,
            default_variant_key: Some(String::new()),
            category,
            search_tokens: vec![stem.to_string()],
            texture_paths: vec![],
            icon_key: format!("minecraft:{stem}:"),
            aliases: vec![],
            block_id: Some(format!("minecraft:{stem}")),
            item_id: None,
            icon_model_path: None,
            studio_model_path: path,
            variant_keys: vec![String::new()],
            presentation: CatalogPresentation::Block,
        }
    }

    fn synthetic_catalog(count: usize) -> Vec<CatalogEntry> {
        (0..count)
            .map(|i| {
                let stem = format!("block_{i:04}");
                let path = format!("assets/minecraft/blockstates/{stem}.json");
                CatalogEntry {
                    id: format!("minecraft:{stem}"),
                    namespace: "minecraft".to_string(),
                    display_name: format!("Block {i}"),
                    kind: CatalogEntryKind::Block,
                    source_path: path.clone(),
                    resolve_kind: CatalogResolveKind::Blockstate,
                    default_variant_key: Some(String::new()),
                    category: CatalogCategory::Building,
                    search_tokens: vec![stem.clone(), format!("block {i}")],
                    texture_paths: vec![],
                    icon_key: format!("minecraft:minecraft:{stem}:"),
                    aliases: vec![],
                    block_id: Some(format!("minecraft:{stem}")),
                    item_id: None,
                    icon_model_path: None,
                    studio_model_path: path,
                    variant_keys: vec![String::new()],
                    presentation: CatalogPresentation::Block,
                }
            })
            .collect()
    }

    #[test]
    #[ignore = "timing benchmark — run with cargo test --release bench_ -- --ignored"]
    fn bench_query_catalog_200_page_under_30ms() {
        let catalog = crate::state::arc_catalog(synthetic_catalog(3_000));
        let filter = CatalogFilter {
            category: None,
            namespace: None,
            search: None,
            fuzzy: false,
        };
        let page = PageReq {
            offset: 0,
            limit: 200,
        };

        let t = Instant::now();
        let result = query_catalog(&catalog, filter, page, None);
        let elapsed_ms = t.elapsed().as_millis();
        assert_eq!(result.entries.len(), 200);
        assert!(
            elapsed_ms < 30,
            "query_catalog page 200 took {elapsed_ms} ms — exceeds 30 ms Phase 1 budget"
        );
    }

    #[test]
    #[ignore = "timing benchmark — run with cargo test --release bench_ -- --ignored"]
    fn bench_query_catalog_5000_under_50ms() {
        let catalog = crate::state::arc_catalog(synthetic_catalog(5_000));
        let filter = CatalogFilter {
            category: None,
            namespace: None,
            search: None,
            fuzzy: false,
        };
        let page = PageReq {
            offset: 0,
            limit: 200,
        };

        let t = Instant::now();
        let result = query_catalog(&catalog, filter, page, None);
        let elapsed_ms = t.elapsed().as_millis();
        assert_eq!(result.entries.len(), 200);
        assert_eq!(result.total, 5_000);
        assert!(
            elapsed_ms < 50,
            "query_catalog 5000 entries took {elapsed_ms} ms — exceeds 50 ms Phase 6 budget"
        );
    }
}
