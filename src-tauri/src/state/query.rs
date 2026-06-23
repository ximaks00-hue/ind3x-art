use std::collections::HashMap;

use crate::dto::{AssetEntry, AssetFacets, AssetFilter, AssetKind, AssetPage, FacetCount, PageReq};
use crate::search::fuzzy_score;

impl super::AppState {
    pub fn query_assets(
        &self,
        handle: u64,
        filter: AssetFilter,
        page: PageReq,
    ) -> Option<AssetPage> {
        let project = self.projects.get(&handle)?;
        let search = filter
            .search
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let mut scored: Vec<(u32, AssetEntry)> = project
            .entries
            .iter()
            .filter_map(|entry| {
                if let Some(kind) = filter.kind {
                    if entry.kind != kind {
                        return None;
                    }
                }
                if let Some(ref ns) = filter.namespace {
                    if &entry.namespace != ns {
                        return None;
                    }
                }
                if let Some(ref q) = search {
                    let hay = format!(
                        "{} {} {}",
                        entry.display_name, entry.path, entry.namespace
                    );
                    if filter.fuzzy {
                        fuzzy_score(q, &hay).map(|score| (score, entry.clone()))
                    } else if hay.to_ascii_lowercase().contains(&q.to_ascii_lowercase()) {
                        Some((1000, entry.clone()))
                    } else {
                        None
                    }
                } else {
                    Some((0, entry.clone()))
                }
            })
            .collect();

        if search.is_some() && filter.fuzzy {
            scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.path.cmp(&b.1.path)));
        }

        let filtered: Vec<AssetEntry> = scored.into_iter().map(|(_, e)| e).collect();
        let total = filtered.len() as u64;
        let start = page.offset as usize;
        let end = start.saturating_add(page.limit as usize).min(filtered.len());
        let entries = if start >= filtered.len() {
            Vec::new()
        } else {
            filtered[start..end].to_vec()
        };

        Some(AssetPage { entries, total })
    }

    pub fn asset_facets(&self, handle: u64) -> Option<AssetFacets> {
        let project = self.projects.get(&handle)?;
        let mut kind_counts: HashMap<String, u64> = HashMap::new();
        let mut ns_counts: HashMap<String, u64> = HashMap::new();

        for entry in &project.entries {
            *kind_counts
                .entry(asset_kind_key(entry.kind).to_string())
                .or_insert(0) += 1;
            *ns_counts.entry(entry.namespace.clone()).or_insert(0) += 1;
        }

        let mut by_kind: Vec<FacetCount> = kind_counts
            .into_iter()
            .map(|(key, count)| FacetCount { key, count })
            .collect();
        by_kind.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));

        let mut by_namespace: Vec<FacetCount> = ns_counts
            .into_iter()
            .map(|(key, count)| FacetCount { key, count })
            .collect();
        by_namespace.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));

        Some(AssetFacets {
            by_kind,
            by_namespace,
        })
    }
}

fn asset_kind_key(kind: AssetKind) -> &'static str {
    match kind {
        AssetKind::Texture => "texture",
        AssetKind::TextureMeta => "textureMeta",
        AssetKind::BlockModel => "blockModel",
        AssetKind::ItemModel => "itemModel",
        AssetKind::Blockstate => "blockstate",
        AssetKind::PackMeta => "packMeta",
        AssetKind::Lang => "lang",
        AssetKind::Sound => "sound",
        AssetKind::Other => "other",
    }
}
