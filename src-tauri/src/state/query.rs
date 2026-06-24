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



        let query_lower = search.as_ref().map(|q| q.to_ascii_lowercase());



        let mut scored: Vec<(u32, &AssetEntry)> = project

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

                    if filter.fuzzy {

                        entry_fuzzy_score(q, entry).map(|score| (score, entry))

                    } else if query_lower

                        .as_ref()

                        .is_some_and(|needle| entry_matches_literal(entry, needle))

                    {

                        Some((1000, entry))

                    } else {

                        None

                    }

                } else {

                    Some((0, entry))

                }

            })

            .collect();



        if search.is_some() && filter.fuzzy {

            scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.path.cmp(&b.1.path)));

        }



        let total = scored.len() as u64;

        let start = page.offset as usize;

        let end = start.saturating_add(page.limit as usize).min(scored.len());

        let entries = if start >= scored.len() {

            Vec::new()

        } else {

            scored[start..end]

                .iter()

                .map(|(_, entry)| (*entry).clone())

                .collect()

        };



        Some(AssetPage { entries, total })

    }



    pub fn asset_facets(&self, handle: u64) -> Option<AssetFacets> {

        let project = self.projects.get(&handle)?;

        let mut kind_counts: HashMap<&'static str, u64> = HashMap::new();

        let mut ns_counts: HashMap<&str, u64> = HashMap::new();



        for entry in &project.entries {

            *kind_counts.entry(asset_kind_key(entry.kind)).or_insert(0) += 1;

            *ns_counts.entry(entry.namespace.as_str()).or_insert(0) += 1;

        }



        let mut by_kind: Vec<FacetCount> = kind_counts

            .into_iter()

            .map(|(key, count)| FacetCount {

                key: key.to_string(),

                count,

            })

            .collect();

        by_kind.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));



        let mut by_namespace: Vec<FacetCount> = ns_counts

            .into_iter()

            .map(|(key, count)| FacetCount {

                key: key.to_string(),

                count,

            })

            .collect();

        by_namespace.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));



        Some(AssetFacets {

            by_kind,

            by_namespace,

        })

    }

}



fn entry_matches_literal(entry: &AssetEntry, needle: &str) -> bool {

    entry.display_name.to_ascii_lowercase().contains(needle)

        || entry.path.to_ascii_lowercase().contains(needle)

        || entry.namespace.to_ascii_lowercase().contains(needle)

}



fn entry_fuzzy_score(query: &str, entry: &AssetEntry) -> Option<u32> {

    [

        entry.display_name.as_str(),

        entry.path.as_str(),

        entry.namespace.as_str(),

    ]

    .into_iter()

    .filter_map(|field| fuzzy_score(query, field))

    .max()

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



#[cfg(test)]

mod query_bench {

    use std::time::Instant;



    use crate::dto::{AssetFilter, PageReq};

    use crate::index::classify::classify_path;



    fn make_bench_entries() -> Vec<crate::dto::AssetEntry> {

        const NAMESPACES: &[&str] = &["minecraft", "create"];

        (0..5_000)

            .map(|i| {

                classify_path(&format!(

                    "assets/{}/textures/block/tex_{i:05}.png",

                    NAMESPACES[i % NAMESPACES.len()]

                ))

                .expect("classify")

            })

            .collect()

    }



    #[test]

    fn bench_query_assets_page_200() {

        let entries = make_bench_entries();



        let mut app = crate::state::AppState::default();

        let handle = app.alloc_handle().id;

        app.projects.insert(

            handle,

            crate::state::Project {

                source_path: std::path::PathBuf::from("."),

                source_kind: crate::dto::SourceKind::Folder,

                fingerprint: "bench".to_string(),

                pack_format: None,

                entries,

                catalog: Vec::new(),

                source: Box::new(

                    crate::source::FolderSource::new(std::path::Path::new(".")).unwrap(),

                ),

                model_cache: std::sync::Mutex::new(std::collections::HashMap::new()),

                texture_model_index: std::collections::HashMap::new(),

                save_journal: Vec::new(),

            },

        );



        let t = Instant::now();

        let page = app

            .query_assets(

                handle,

                AssetFilter::default(),

                PageReq {

                    offset: 0,

                    limit: 200,

                },

            )

            .expect("page");

        let elapsed_ms = t.elapsed().as_millis();

        assert_eq!(page.entries.len(), 200);

        assert!(

            elapsed_ms < 30,

            "query_assets page 200 took {elapsed_ms} ms — exceeds 30 ms budget"

        );

    }

}

