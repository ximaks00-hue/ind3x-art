use std::collections::HashSet;

use crate::dto::{
    AssetEntry, AssetKind, CatalogEntry, CatalogEntryKind, CatalogResolveKind,
};
use crate::model::types::{blockstate_id_from_asset_path, model_id_from_asset_path};
use crate::resolve::{collect_variant_models, list_all_variant_models};
use crate::source::AssetSource;

use super::category::{categorize, presentation_for};
use super::creative_tabs::CreativeTabOrder;
use super::dedup::dedup_catalog;
use super::lang::{build_lang_resolver, humanize_id, LangResolver};
use crate::model::parse::parse_blockstate;

pub struct CatalogBuildOptions<'a> {
    pub language: &'a str,
    /// When false, skip per-blockstate JSON reads during catalog assembly (load via `list_variants`).
    pub resolve_variant_keys: bool,
    pub tab_order: Option<&'a CreativeTabOrder>,
}

impl Default for CatalogBuildOptions<'_> {
    fn default() -> Self {
        Self {
            language: "en_us",
            resolve_variant_keys: false,
            tab_order: None,
        }
    }
}

pub fn build_from_entries(
    entries: &[AssetEntry],
    source: Option<&dyn AssetSource>,
) -> Vec<CatalogEntry> {
    build_from_entries_with_options(entries, source, CatalogBuildOptions::default())
}

pub fn build_from_entries_with_options(
    entries: &[AssetEntry],
    source: Option<&dyn AssetSource>,
    options: CatalogBuildOptions<'_>,
) -> Vec<CatalogEntry> {
    let lang = build_lang_resolver(entries, source);
    let blockstate_names = blockstate_names_set(entries);
    let item_model_paths = item_model_paths_set(entries);
    let block_model_paths = block_model_paths_set(entries);

    let mut registry: Vec<CatalogEntry> = Vec::new();

    // Phase 1: all blockstates → Block
    for entry in entries {
        if entry.kind != AssetKind::Blockstate {
            continue;
        }
        let Some((namespace, block_name)) = blockstate_id_from_asset_path(&entry.path) else {
            continue;
        };
        let id = format!("{namespace}:{block_name}");
        let has_item_model = item_model_paths.contains(&(namespace.clone(), block_name.to_string()));
        let (variant_keys, default_variant_key) = if options.resolve_variant_keys {
            source
                .map(|s| variant_info_for_blockstate(s, &entry.path))
                .unwrap_or_default()
        } else {
            (vec![], None)
        };
        let icon_model_path = resolve_icon_model_path(
            &namespace,
            &block_name,
            &item_model_paths,
            &block_model_paths,
        );
        registry.push(make_entry(
            &lang,
            options.language,
            MakeEntryInput {
                id: id.clone(),
                namespace,
                stem: block_name.to_string(),
                kind: CatalogEntryKind::Block,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Blockstate,
                default_variant_key,
                variant_keys,
                texture_paths: vec![],
                block_id: Some(id.clone()),
                item_id: has_item_model.then(|| id.clone()),
                icon_model_path,
                studio_model_path: entry.path.clone(),
            },
            options.tab_order,
        ));
    }

    // Phase 2: item models without blockstate → Item
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
        if blockstate_names.contains(&(namespace.clone(), item_name.to_string())) {
            continue;
        }
        let id = format!("{namespace}:{item_name}");
        registry.push(make_entry(
            &lang,
            options.language,
            MakeEntryInput {
                id: id.clone(),
                namespace,
                stem: item_name.to_string(),
                kind: CatalogEntryKind::Item,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Model,
                default_variant_key: None,
                variant_keys: vec![],
                texture_paths: vec![],
                block_id: None,
                item_id: Some(id),
                icon_model_path: Some(entry.path.clone()),
                studio_model_path: entry.path.clone(),
            },
            options.tab_order,
        ));
    }

    // Phase 3: orphan block models → Block (fallback)
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
        let icon_model_path = resolve_icon_model_path(
            &namespace,
            block_name,
            &item_model_paths,
            &block_model_paths,
        );
        registry.push(make_entry(
            &lang,
            options.language,
            MakeEntryInput {
                id: id.clone(),
                namespace,
                stem: block_name.to_string(),
                kind: CatalogEntryKind::Block,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Model,
                default_variant_key: None,
                variant_keys: vec![],
                texture_paths: vec![],
                block_id: Some(id),
                item_id: None,
                icon_model_path,
                studio_model_path: entry.path.clone(),
            },
            options.tab_order,
        ));
    }

    let registry = dedup_catalog(registry);
    if should_use_texture_catalog_fallback(&registry, entries) {
        return super::texture_catalog::build_texture_catalog_fallback(&lang, entries, options);
    }
    registry
}

fn should_use_texture_catalog_fallback(registry: &[CatalogEntry], entries: &[AssetEntry]) -> bool {
    registry.is_empty()
        && super::catalog_source_entry_count(entries) == 0
        && (super::texture_catalog::pack_has_block_item_textures(entries)
            || entries.iter().any(|e| e.kind == AssetKind::Lang))
}

fn variant_info_for_blockstate(
    source: &dyn AssetSource,
    blockstate_path: &str,
) -> (Vec<String>, Option<String>) {
    let Ok(bytes) = source.read(blockstate_path) else {
        return (vec![], None);
    };
    let Ok(blockstate) = parse_blockstate(&bytes) else {
        return (vec![], None);
    };
    let variants = list_all_variant_models(&blockstate);
    let keys: Vec<String> = variants.iter().map(|(_, key)| key.clone()).collect();
    let default = keys.first().cloned().or_else(|| {
        collect_variant_models(&blockstate)
            .first()
            .map(|(_, key)| key.clone())
    });
    (keys, default)
}

fn resolve_icon_model_path(
    namespace: &str,
    stem: &str,
    item_models: &HashSet<(String, String)>,
    block_models: &HashSet<(String, String)>,
) -> Option<String> {
    if item_models.contains(&(namespace.to_string(), stem.to_string())) {
        return Some(format!("assets/{namespace}/models/item/{stem}.json"));
    }
    if block_models.contains(&(namespace.to_string(), stem.to_string())) {
        return Some(format!("assets/{namespace}/models/block/{stem}.json"));
    }
    None
}

fn blockstate_names_set(entries: &[AssetEntry]) -> HashSet<(String, String)> {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::Blockstate)
        .filter_map(|e| blockstate_id_from_asset_path(&e.path))
        .collect()
}

fn item_model_paths_set(entries: &[AssetEntry]) -> HashSet<(String, String)> {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::ItemModel)
        .filter_map(|e| model_id_from_asset_path(&e.path))
        .filter_map(|(ns, path)| {
            path.strip_prefix("item/")
                .map(|stem| (ns, stem.to_string()))
        })
        .collect()
}

fn block_model_paths_set(entries: &[AssetEntry]) -> HashSet<(String, String)> {
    entries
        .iter()
        .filter(|e| e.kind == AssetKind::BlockModel)
        .filter_map(|e| model_id_from_asset_path(&e.path))
        .filter_map(|(ns, path)| {
            path.strip_prefix("block/")
                .map(|stem| (ns, stem.to_string()))
        })
        .collect()
}

pub(crate) fn make_entry_public(
    lang: &LangResolver,
    language: &str,
    input: MakeEntryInput,
    tab_order: Option<&CreativeTabOrder>,
) -> CatalogEntry {
    make_entry(lang, language, input, tab_order)
}

pub(crate) struct MakeEntryInput {
    pub id: String,
    pub namespace: String,
    pub stem: String,
    pub kind: CatalogEntryKind,
    pub source_path: String,
    pub resolve_kind: CatalogResolveKind,
    pub default_variant_key: Option<String>,
    pub variant_keys: Vec<String>,
    pub texture_paths: Vec<String>,
    pub block_id: Option<String>,
    pub item_id: Option<String>,
    pub icon_model_path: Option<String>,
    pub studio_model_path: String,
}

fn make_entry(
    lang: &LangResolver,
    language: &str,
    input: MakeEntryInput,
    tab_order: Option<&CreativeTabOrder>,
) -> CatalogEntry {
    let display_name = lang
        .resolve_display_name(language, input.kind, &input.namespace, &input.stem)
        .unwrap_or_else(|| humanize_id(&input.stem));

    let category = categorize(&input.id, &input.source_path, input.kind, tab_order);
    let presentation = presentation_for(&input.id, &input.source_path, input.kind, category);
    let variant_suffix = input.default_variant_key.as_deref().unwrap_or("");
    let icon_key = format!("{}:{variant_suffix}", input.id);

    let mut search_tokens = vec![
        display_name.to_lowercase(),
        input.id.to_lowercase(),
        input.stem.to_lowercase(),
    ];
    if let Some(ref block_id) = input.block_id {
        search_tokens.push(block_id.to_lowercase());
    }
    if let Some(ref item_id) = input.item_id {
        search_tokens.push(item_id.to_lowercase());
    }
    search_tokens.sort();
    search_tokens.dedup();

    CatalogEntry {
        id: input.id,
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
        block_id: input.block_id,
        item_id: input.item_id,
        icon_model_path: input.icon_model_path,
        studio_model_path: input.studio_model_path,
        variant_keys: input.variant_keys,
        presentation,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::Path;

    use crate::catalog::creative_tabs;
    use crate::catalog::query::query_catalog;
    use crate::catalog::textures::enrich_catalog_texture_paths;
    use crate::dto::{CatalogCategory, CatalogFilter, CatalogPresentation, PageReq};
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
        assert_eq!(stone.block_id.as_deref(), Some("minecraft:test_stone"));
        assert!(!stone.studio_model_path.contains("models/"));
        assert_eq!(stone.presentation, CatalogPresentation::Block);
    }

    #[test]
    fn builds_multipart_fence_entry() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/multipart_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let tabs = creative_tabs::load_creative_tabs(&source);
        let catalog = build_from_entries_with_options(
            &entries,
            Some(&source),
            CatalogBuildOptions {
                language: "en_us",
                resolve_variant_keys: true,
                tab_order: Some(&tabs),
            },
        );
        let pack = PackInfo { pack_format: None };
        let mut model_cache = HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut model_cache, pack);
        let mut arced = crate::state::arc_catalog(catalog);
        enrich_catalog_texture_paths(&mut arced, &mut registry, &pack);
        let catalog: Vec<CatalogEntry> = arced.iter().map(|e| e.as_ref().clone()).collect();

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
        assert!(!fence.variant_keys.is_empty());
    }

    #[test]
    fn builds_studio_pack_catalog() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/studio_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));
        assert!(catalog.len() >= 20);
        for entry in &catalog {
            assert!(
                !entry.display_name.is_empty(),
                "entry {} missing displayName",
                entry.id
            );
            assert!(!entry.studio_model_path.is_empty());
        }
    }

    #[test]
    fn builds_texture_only_pack_catalog() {
        let root =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/texture_only_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));
        assert!(!catalog.is_empty());
        assert!(catalog.iter().any(|e| e.id == "ic2:batbox"));
        assert!(catalog.iter().any(|e| e.id == "ic2:wrench"));
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
        assert_eq!(legacy.studio_model_path, legacy.source_path);
    }

    #[test]
    fn blockstate_default_variant_key_from_json() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let tabs = creative_tabs::load_creative_tabs(&source);
        let catalog = build_from_entries_with_options(
            &entries,
            Some(&source),
            CatalogBuildOptions {
                language: "en_us",
                resolve_variant_keys: true,
                tab_order: Some(&tabs),
            },
        );

        let stone = catalog
            .iter()
            .find(|e| e.id.contains("test_stone"))
            .expect("test_stone");
        assert_eq!(stone.default_variant_key.as_deref(), Some(""));
        assert!(!stone.variant_keys.is_empty());
    }

    #[test]
    fn search_stone_finds_entry() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        let page = query_catalog(
            &crate::state::arc_catalog(catalog),
            CatalogFilter {
                category: None,
                namespace: None,
                search: Some("stone".to_string()),
                fuzzy: false,
            },
            PageReq {
                offset: 0,
                limit: 50,
            },
            None,
        );
        assert!(!page.entries.is_empty());
        assert!(page.entries.iter().any(|e| e.id.contains("test_stone")));
    }

    #[test]
    fn search_cyrillic_sword_finds_item() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/lang_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries_with_options(
            &entries,
            Some(&source),
            CatalogBuildOptions {
                language: "ru_ru",
                ..Default::default()
            },
        );

        let page = query_catalog(
            &crate::state::arc_catalog(catalog),
            CatalogFilter {
                category: None,
                namespace: None,
                search: Some("меч".to_string()),
                fuzzy: false,
            },
            PageReq {
                offset: 0,
                limit: 50,
            },
            None,
        );
        assert!(
            page.entries.iter().any(|e| e.id.contains("test_sword")),
            "search 'меч' should find test_sword"
        );
    }

    #[test]
    fn dedup_block_item_same_id() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/simple_pack");
        let entries = fixture_entries(&root);
        let source = FolderSource::new(&root).expect("source");
        let catalog = build_from_entries(&entries, Some(&source));

        let stone_count = catalog
            .iter()
            .filter(|e| e.id == "minecraft:test_stone")
            .count();
        assert_eq!(stone_count, 1, "block+item same id must be one cell");
        let stone = catalog
            .iter()
            .find(|e| e.id == "minecraft:test_stone")
            .expect("stone");
        assert_eq!(stone.kind, CatalogEntryKind::Block);
        assert_eq!(stone.item_id.as_deref(), Some("minecraft:test_stone"));
        assert!(stone
            .icon_model_path
            .as_deref()
            .is_some_and(|p| p.contains("models/item")));
    }
}
