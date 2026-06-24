use std::collections::HashSet;

use crate::dto::{AssetEntry, CatalogEntry};
use crate::error::CoreResult;
use crate::model::normalize::PackInfo;
use crate::resolve::ModelRegistry;
use crate::state::{arc_catalog, Project};
use sled::Db;

use super::cache;
use super::dedup::dedup_catalog;
use super::pipeline::{build_deduped_catalog, CatalogBuildCtx};
use super::textures::enrich_catalog_texture_paths;

fn normalize_paths(paths: &[String]) -> HashSet<String> {
    paths
        .iter()
        .map(|p| p.replace('\\', "/"))
        .collect()
}

/// Lang, pack format, models, blockstates, and creative tab order require a full catalog rebuild.
pub fn paths_need_full_catalog_rebuild(changed_paths: &[String]) -> bool {
    changed_paths.iter().any(|raw| {
        let path = raw.replace('\\', "/");
        (path.contains("/lang/") && path.ends_with(".json"))
            || path.ends_with("pack.mcmeta")
            || path.ends_with("creative_tabs.json")
            || (path.contains("/models/") && path.ends_with(".json"))
            || (path.contains("/blockstates/") && path.ends_with(".json"))
    })
}

fn catalog_entry_affected(entry: &CatalogEntry, paths: &HashSet<String>) -> bool {
    if paths.contains(&entry.source_path) || paths.contains(&entry.studio_model_path) {
        return true;
    }
    if let Some(ref icon) = entry.icon_model_path {
        if paths.contains(icon) {
            return true;
        }
    }
    entry.texture_paths.iter().any(|t| paths.contains(t))
}

fn expand_asset_paths(project: &Project, paths: &HashSet<String>) -> HashSet<String> {
    let mut out: HashSet<String> = paths.clone();
    for path in paths {
        if path.contains("/textures/") {
            if let Some(models) = project.index.texture_model_index.get(path) {
                for model in models {
                    out.insert(model.path.clone());
                }
            }
        }
    }
    out
}

fn assets_for_paths(project: &Project, paths: &HashSet<String>) -> Vec<AssetEntry> {
    let expanded = expand_asset_paths(project, paths);
    project
        .index
        .entries
        .iter()
        .filter(|e| expanded.contains(&e.path))
        .cloned()
        .collect()
}

/// Incremental catalog update for a partial reindex — keeps sled cache warm.
pub fn patch_project_catalog(
    project: &mut Project,
    db: &Db,
    changed_paths: &[String],
) -> CoreResult<()> {
    if changed_paths.is_empty() {
        return Ok(());
    }

    let paths = normalize_paths(changed_paths);

    if paths_need_full_catalog_rebuild(changed_paths) {
        super::build_project_catalog(project, db)?;
        return Ok(());
    }

    if project.catalog.entries.is_empty() {
        super::build_project_catalog(project, db)?;
        return Ok(());
    }

    let affected_icon_keys: Vec<String> = project
        .catalog
        .entries
        .iter()
        .filter(|entry| catalog_entry_affected(entry.as_ref(), &paths))
        .map(|entry| entry.icon_key.clone())
        .collect();

    let affected_source_paths: HashSet<String> = project
        .catalog
        .entries
        .iter()
        .filter(|entry| catalog_entry_affected(entry.as_ref(), &paths))
        .map(|entry| entry.source_path.clone())
        .collect();

    project
        .catalog
        .entries
        .retain(|entry| !catalog_entry_affected(entry.as_ref(), &paths));

    let changed_assets = assets_for_paths(project, &paths);
    let mut rebuild_assets: Vec<AssetEntry> = project
        .index
        .entries
        .iter()
        .filter(|e| affected_source_paths.contains(&e.path))
        .cloned()
        .collect();
    let mut rebuild_paths: HashSet<String> = rebuild_assets
        .iter()
        .map(|e| e.path.clone())
        .collect();
    for asset in changed_assets {
        if matches!(
            asset.kind,
            crate::dto::AssetKind::Blockstate
                | crate::dto::AssetKind::ItemModel
                | crate::dto::AssetKind::BlockModel
        ) && rebuild_paths.insert(asset.path.clone())
        {
            rebuild_assets.push(asset);
        }
    }

    if !rebuild_assets.is_empty() {
        let source = project.source.as_ref();
        let language = project.catalog.language.clone();
        let ctx = CatalogBuildCtx::new(&rebuild_assets, Some(source), &language);
        let new_slice = build_deduped_catalog(&ctx);
        project.catalog.entries.append(&mut arc_catalog(new_slice));
        let deduped = arc_catalog(dedup_catalog(
            project
                .catalog
                .entries
                .iter()
                .map(|e| e.as_ref().clone())
                .collect(),
        ));
        project.catalog.entries = deduped;
    }

    let pack = PackInfo {
        pack_format: project.pack_format,
    };
    let source = project.source.as_ref();
    let mut model_cache = crate::state::lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut model_cache, pack);
    enrich_catalog_texture_paths(&mut project.catalog.entries, &mut registry, &pack);
    drop(model_cache);
    project.catalog.id_index = crate::state::build_catalog_id_index(&project.catalog.entries);

    if super::catalog_needs_rebuild(project) {
        super::build_project_catalog(project, db)?;
        return Ok(());
    }

    super::icon_cache::invalidate_icon_cache_keys(db, &project.index.fingerprint, &affected_icon_keys)?;

    let flat: Vec<CatalogEntry> = project
        .catalog
        .entries
        .iter()
        .map(|e| e.as_ref().clone())
        .collect();
    cache::save_catalog_cache(
        db,
        &project.index.fingerprint,
        &project.catalog.language,
        &flat,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{
        CatalogCategory, CatalogEntry, CatalogEntryKind, CatalogPresentation, CatalogResolveKind,
    };

    fn sample_catalog_entry(id: &str, source: &str) -> CatalogEntry {
        CatalogEntry {
            id: id.to_string(),
            namespace: "minecraft".to_string(),
            display_name: id.to_string(),
            kind: CatalogEntryKind::Block,
            source_path: source.to_string(),
            resolve_kind: CatalogResolveKind::Blockstate,
            default_variant_key: Some(String::new()),
            category: CatalogCategory::Building,
            search_tokens: vec![id.to_string()],
            texture_paths: vec!["assets/minecraft/textures/block/stone.png".to_string()],
            icon_key: format!("minecraft:{id}:"),
            aliases: vec![],
            block_id: Some(id.to_string()),
            item_id: None,
            icon_model_path: None,
            studio_model_path: source.to_string(),
            variant_keys: vec![String::new()],
            presentation: CatalogPresentation::Block,
        }
    }

    #[test]
    fn detects_texture_path_touch() {
        let entry = sample_catalog_entry(
            "minecraft:stone",
            "assets/minecraft/blockstates/stone.json",
        );
        let paths = HashSet::from(["assets/minecraft/textures/block/stone.png".to_string()]);
        assert!(catalog_entry_affected(&entry, &paths));
    }

    #[test]
    fn texture_touch_rebuilds_affected_blockstate_rows() {
        use crate::source::{AssetSource, FolderSource};
        use tempfile::TempDir;

        let root = TempDir::new().expect("temp");
        let bs_path = "assets/minecraft/blockstates/stone.json";
        let tex_path = "assets/minecraft/textures/block/stone.png";
        std::fs::create_dir_all(root.path().join("assets/minecraft/blockstates")).unwrap();
        std::fs::create_dir_all(root.path().join("assets/minecraft/textures/block")).unwrap();
        std::fs::write(
            root.path().join(bs_path),
            br#"{"variants":{"":{"model":"minecraft:block/stone"}}}"#,
        )
        .unwrap();
        std::fs::write(root.path().join(tex_path), b"png").unwrap();

        let source = FolderSource::new(root.path()).expect("source");
        let entries: Vec<AssetEntry> = source
            .list_entries()
            .unwrap()
            .into_iter()
            .filter_map(|p| crate::index::classify::classify_path(&p))
            .collect();
        let mut catalog = super::super::build_from_entries(&entries, Some(&source));
        assert_eq!(catalog.len(), 1);
        catalog[0].texture_paths = vec![tex_path.to_string()];

        let mut project = crate::state::Project {
            source_path: root.path().to_path_buf(),
            source_kind: crate::dto::SourceKind::Folder,
            pack_format: None,
            source: Box::new(source),
            index: crate::state::IndexState {
                fingerprint: "test-fp".to_string(),
                entries,
                entry_id_index: std::collections::HashMap::new(),
                texture_model_index: std::collections::HashMap::new(),
                model_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
            },
            catalog: {
                let entries = crate::state::arc_catalog(catalog);
                let id_index = crate::state::build_catalog_id_index(&entries);
                crate::state::CatalogState {
                    entries,
                    id_index,
                    creative_tab_order: Default::default(),
                    language: "en_us".to_string(),
                }
            },
            save: crate::state::SaveState {
                journal: Vec::new(),
            },
        };

        let db = sled::Config::new().temporary(true).open().expect("db");
        patch_project_catalog(
            &mut project,
            &db,
            &[tex_path.to_string()],
        )
        .expect("patch");

        assert_eq!(project.catalog.entries.len(), 1, "texture patch must restore block row");
        assert_eq!(project.catalog.entries[0].id, "minecraft:stone");
    }

    #[test]
    fn model_json_changes_need_full_rebuild() {
        assert!(paths_need_full_catalog_rebuild(&[
            "assets/minecraft/models/block/stone.json".to_string()
        ]));
        assert!(paths_need_full_catalog_rebuild(&[
            "assets/minecraft/blockstates/stone.json".to_string()
        ]));
        assert!(paths_need_full_catalog_rebuild(&["pack.mcmeta".to_string()]));
    }
}
