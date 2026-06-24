use std::collections::HashSet;

use crate::dto::{
    AssetEntry, AssetKind, CatalogEntry, CatalogEntryKind, CatalogResolveKind,
};
use crate::model::types::{blockstate_id_from_asset_path, model_id_from_asset_path};

use super::category::categorize;
use super::dedup::dedup_catalog;
use super::lang::{build_lang_index, humanize_id, LangIndex};
use crate::model::parse::parse_blockstate;
use crate::resolve::collect_variant_models;
use crate::source::AssetSource;

pub fn build_from_entries(
    entries: &[AssetEntry],
    source: Option<&dyn AssetSource>,
) -> Vec<CatalogEntry> {
    let lang = build_lang_index(entries, source);
    let mut out = Vec::new();

    let blockstate_names = blockstate_names_set(entries);

    for entry in entries {
        if entry.kind != AssetKind::Blockstate {
            continue;
        }
        let Some((namespace, block_name)) = blockstate_id_from_asset_path(&entry.path) else {
            continue;
        };
        let id = format!("{namespace}:{block_name}");
        let default_variant_key = source
            .and_then(|s| default_variant_key_for_blockstate(s, &entry.path));
        out.push(make_entry(
            &lang,
            MakeEntryInput {
                id,
                namespace,
                stem: block_name.to_string(),
                kind: CatalogEntryKind::Block,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Blockstate,
                default_variant_key,
                texture_paths: vec![],
            },
        ));
    }

    for entry in entries {
        if entry.kind != AssetKind::ItemModel {
            continue;
        }
        let Some((namespace, model_path)) = model_id_from_asset_path(&entry.path) else {
            continue;
        };
        if !model_path.starts_with("item/") {
            continue;
        }
        let item_name = model_path.strip_prefix("item/").unwrap_or(&model_path);
        let id = format!("{namespace}:{item_name}");
        if blockstate_names.contains(&(namespace.clone(), item_name.to_string())) {
            continue;
        }
        out.push(make_entry(
            &lang,
            MakeEntryInput {
                id,
                namespace,
                stem: item_name.to_string(),
                kind: CatalogEntryKind::Item,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Model,
                default_variant_key: None,
                texture_paths: vec![],
            },
        ));
    }

    for entry in entries {
        if entry.kind != AssetKind::BlockModel {
            continue;
        }
        let Some((namespace, model_path)) = model_id_from_asset_path(&entry.path) else {
            continue;
        };
        if !model_path.starts_with("block/") {
            continue;
        }
        let block_name = model_path.strip_prefix("block/").unwrap_or(&model_path);
        if blockstate_names.contains(&(namespace.clone(), block_name.to_string())) {
            continue;
        }
        let id = format!("{namespace}:{block_name}");
        out.push(make_entry(
            &lang,
            MakeEntryInput {
                id,
                namespace,
                stem: block_name.to_string(),
                kind: CatalogEntryKind::Block,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Model,
                default_variant_key: None,
                texture_paths: vec![],
            },
        ));
    }

    dedup_catalog(out)
}

fn default_variant_key_for_blockstate(
    source: &dyn AssetSource,
    blockstate_path: &str,
) -> Option<String> {
    let bytes = source.read(blockstate_path).ok()?;
    let blockstate = parse_blockstate(&bytes).ok()?;
    let variants = collect_variant_models(&blockstate);
    variants.first().map(|(_, key)| key.clone())
}

fn blockstate_names_set(entries: &[AssetEntry]) -> HashSet<(String, String)> {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::Blockstate)
        .filter_map(|e| blockstate_id_from_asset_path(&e.path))
        .collect()
}

struct MakeEntryInput {
    id: String,
    namespace: String,
    stem: String,
    kind: CatalogEntryKind,
    source_path: String,
    resolve_kind: CatalogResolveKind,
    default_variant_key: Option<String>,
    texture_paths: Vec<String>,
}

fn make_entry(lang: &LangIndex, input: MakeEntryInput) -> CatalogEntry {
    let display_name = match input.kind {
        CatalogEntryKind::Block => lang
            .resolve_block(&input.namespace, &input.stem)
            .unwrap_or_else(|| humanize_id(&input.stem)),
        CatalogEntryKind::Item => lang
            .resolve_item(&input.namespace, &input.stem)
            .unwrap_or_else(|| humanize_id(&input.stem)),
    };

    let category = categorize(&input.id, &input.source_path, input.kind);
    let variant_suffix = input.default_variant_key.as_deref().unwrap_or("");
    let icon_key = format!("{}:{variant_suffix}", input.id);
    let mut search_tokens = vec![
        display_name.to_ascii_lowercase(),
        input.id.to_ascii_lowercase(),
        input.stem.to_ascii_lowercase(),
    ];
    search_tokens.sort();
    search_tokens.dedup();

    CatalogEntry {
        id: input.id.clone(),
        namespace: input.namespace,
        display_name,
        kind: input.kind,
        source_path: input.source_path,
        resolve_kind: input.resolve_kind,
        default_variant_key: input.default_variant_key,
        category,
        search_tokens,
        texture_paths: input.texture_paths,
        icon_key,
        aliases: vec![],
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::Path;

    use crate::catalog::textures::enrich_catalog_texture_paths;
    use crate::dto::CatalogCategory;
    use crate::index::classify::classify_path;
    use crate::model::normalize::PackInfo;
    use crate::resolve::ModelRegistry;
    use crate::source::FolderSource;

    use super::*;

    fn fixture_entries(root: &Path) -> Vec<AssetEntry> {
        let source = FolderSource::new(root).expect("fixture source");
        source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|path| classify_path(&path))
            .collect()
    }

    #[test]
    fn builds_simple_pack_catalog() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        assert!(!catalog.is_empty());
        let stone = catalog
            .iter()
            .find(|e| e.id.contains("test_stone"))
            .expect("test_stone catalog entry");
        assert_eq!(stone.kind, CatalogEntryKind::Block);
        assert_eq!(stone.display_name, "Test Stone");
    }

    #[test]
    fn builds_multipart_fence_entry() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/multipart_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let mut catalog = build_from_entries(&entries, Some(&source));
        let pack = PackInfo { pack_format: None };
        let mut model_cache = HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut model_cache, pack);
        enrich_catalog_texture_paths(&mut catalog, &mut registry, &pack);

        let fence = catalog
            .iter()
            .find(|e| e.id.contains("test_fence"))
            .expect("fence entry");
        assert_eq!(fence.resolve_kind, CatalogResolveKind::Blockstate);
        assert_eq!(fence.category, CatalogCategory::Decoration);
        assert!(
            !fence.texture_paths.is_empty(),
            "multipart fence should resolve texture paths"
        );
    }

    #[test]
    fn builds_studio_pack_catalog() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/studio_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));
        assert!(catalog.len() >= 20);
    }

    #[test]
    fn builds_legacy_pack_block_model_entry() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/legacy_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        let legacy = catalog
            .iter()
            .find(|e| e.id.contains("legacy_stone"))
            .expect("legacy_stone catalog entry");
        assert_eq!(legacy.kind, CatalogEntryKind::Block);
        assert_eq!(legacy.resolve_kind, CatalogResolveKind::Model);
        assert_eq!(legacy.display_name, "Legacy Stone");
    }

    #[test]
    fn blockstate_default_variant_key_from_json() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        let stone = catalog
            .iter()
            .find(|e| e.id.contains("test_stone"))
            .expect("test_stone");
        assert_eq!(stone.default_variant_key.as_deref(), Some(""));
    }

    #[test]
    fn search_stone_finds_entry() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        use crate::dto::CatalogFilter;
        use crate::catalog::query::query_catalog;

        let page = query_catalog(
            &catalog,
            CatalogFilter {
                category: None,
                namespace: None,
                search: Some("stone".to_string()),
                fuzzy: false,
            },
            crate::dto::PageReq {
                offset: 0,
                limit: 50,
            },
        );
        assert!(!page.entries.is_empty());
        assert!(page.entries.iter().any(|e| e.id.contains("test_stone")));
    }
}
