use std::collections::{HashMap, HashSet};

use crate::dto::{AssetEntry, AssetKind, CatalogEntry, CatalogEntryKind, CatalogResolveKind};

use super::builder::{make_entry_public, CatalogBuildOptions, MakeEntryInput};
use super::dedup::dedup_catalog;
use super::lang::LangResolver;

pub fn pack_has_block_item_textures(entries: &[AssetEntry]) -> bool {
    entries
        .iter()
        .any(|e| e.kind == AssetKind::Texture && is_block_item_texture_path(&e.path))
}

pub fn build_texture_catalog_fallback(
    lang: &LangResolver,
    entries: &[AssetEntry],
    options: CatalogBuildOptions<'_>,
) -> Vec<CatalogEntry> {
    let texture_index = TextureStemIndex::from_entries(entries);

    let mut registry = Vec::new();
    for seed in lang.catalog_lang_entries(options.language) {
        let id = format!("{}:{}", seed.namespace, seed.stem);
        let texture_path =
            texture_index.find(&seed.namespace, seed.kind, &seed.stem);
        let texture_paths_vec = texture_path.clone().into_iter().collect::<Vec<_>>();
        let studio_path = texture_path.unwrap_or_else(|| {
            synthetic_texture_path(&seed.namespace, seed.kind, &seed.stem)
        });

        registry.push(make_entry_public(
            lang,
            options.language,
            MakeEntryInput {
                id: id.clone(),
                namespace: seed.namespace.clone(),
                stem: seed.stem.clone(),
                kind: seed.kind,
                source_path: studio_path.clone(),
                resolve_kind: CatalogResolveKind::Texture,
                default_variant_key: None,
                variant_keys: vec![],
                texture_paths: texture_paths_vec,
                block_id: (seed.kind == CatalogEntryKind::Block).then_some(id.clone()),
                item_id: (seed.kind == CatalogEntryKind::Item).then_some(id),
                icon_model_path: None,
                studio_model_path: studio_path,
            },
        ));
    }

    if registry.is_empty() {
        registry = build_from_orphan_textures(lang, entries, options);
    }

    dedup_catalog(registry)
}

fn build_from_orphan_textures(
    lang: &LangResolver,
    entries: &[AssetEntry],
    options: CatalogBuildOptions<'_>,
) -> Vec<CatalogEntry> {
    let mut seen_stems: HashSet<String> = HashSet::new();
    let mut registry = Vec::new();

    for entry in entries {
        if entry.kind != AssetKind::Texture {
            continue;
        }
        let Some((kind, stem)) = texture_stem_from_path(&entry.path) else {
            continue;
        };
        let id = format!("{}:{}", entry.namespace, stem);
        if !seen_stems.insert(id.clone()) {
            continue;
        }
        registry.push(make_entry_public(
            lang,
            options.language,
            MakeEntryInput {
                id: id.clone(),
                namespace: entry.namespace.clone(),
                stem: stem.clone(),
                kind,
                source_path: entry.path.clone(),
                resolve_kind: CatalogResolveKind::Texture,
                default_variant_key: None,
                variant_keys: vec![],
                texture_paths: vec![entry.path.clone()],
                block_id: (kind == CatalogEntryKind::Block).then_some(id.clone()),
                item_id: (kind == CatalogEntryKind::Item).then_some(id),
                icon_model_path: None,
                studio_model_path: entry.path.clone(),
            },
        ));
    }

    registry
}

fn texture_stem_from_path(path: &str) -> Option<(CatalogEntryKind, String)> {
    let path = path.replace('\\', "/");
    let (kind, marker) = if path.contains("/textures/block/") || path.contains("/textures/blocks/") {
        (CatalogEntryKind::Block, "/textures/block")
    } else if path.contains("/textures/item/") || path.contains("/textures/items/") {
        (CatalogEntryKind::Item, "/textures/item")
    } else {
        return None;
    };

    let after = path
        .replace("/textures/blocks/", "/textures/block/")
        .replace("/textures/items/", "/textures/item/");
    let idx = after.find(marker)? + marker.len();
    let rel = after[idx..].trim_start_matches('/').strip_suffix(".png")?;
    if rel.is_empty() || rel.contains('/') {
        return None;
    }
    Some((kind, rel.to_string()))
}

#[allow(dead_code)]
pub fn find_representative_texture(
    namespace: &str,
    kind: CatalogEntryKind,
    stem: &str,
    texture_paths: &HashSet<String>,
) -> Option<String> {
    TextureStemIndex::from_paths(texture_paths.iter().cloned())
        .find(namespace, kind, stem)
}

struct TextureStemIndex {
    flat: HashMap<(String, CatalogEntryKind, String), String>,
    multiface: Vec<(String, CatalogEntryKind, String, String)>,
}

impl TextureStemIndex {
    fn from_entries(entries: &[AssetEntry]) -> Self {
        Self::from_paths(
            entries
                .iter()
                .filter(|e| e.kind == AssetKind::Texture)
                .map(|e| e.path.clone()),
        )
    }

    fn from_paths(paths: impl IntoIterator<Item = String>) -> Self {
        let mut flat = HashMap::new();
        let mut multiface = Vec::new();
        for path in paths {
            let normalized = path.replace('\\', "/");
            let Some((ns, kind, stem, is_flat)) = parse_texture_path(&normalized) else {
                continue;
            };
            if is_flat {
                flat.entry((ns, kind, stem)).or_insert(path);
            } else {
                multiface.push((ns, kind, stem, path));
            }
        }
        multiface.sort_by(|a, b| a.3.cmp(&b.3));
        Self { flat, multiface }
    }

    fn find(&self, namespace: &str, kind: CatalogEntryKind, stem: &str) -> Option<String> {
        if let Some(path) = self
            .flat
            .get(&(namespace.to_string(), kind, stem.to_string()))
        {
            return Some(path.clone());
        }
        let needle = format!("/{stem}/");
        let dot_needle = format!("/{stem}.");
        for (ns, k, _stem, path) in &self.multiface {
            if ns == namespace
                && *k == kind
                && (path.contains(&needle) || path.contains(&dot_needle))
                && (path.ends_with("/north.png") || path.ends_with("/all.png"))
            {
                return Some(path.clone());
            }
        }
        for (ns, k, _stem, path) in &self.multiface {
            if ns == namespace
                && *k == kind
                && (path.contains(&needle) || path.contains(&dot_needle))
                && path.ends_with(".png")
                && !path.contains("_overlay")
            {
                return Some(path.clone());
            }
        }
        None
    }
}

fn parse_texture_path(path: &str) -> Option<(String, CatalogEntryKind, String, bool)> {
    let (kind, folder) = if path.contains("/textures/block/") || path.contains("/textures/blocks/") {
        (CatalogEntryKind::Block, "block")
    } else if path.contains("/textures/item/") || path.contains("/textures/items/") {
        (CatalogEntryKind::Item, "item")
    } else {
        return None;
    };
    let normalized = path
        .replace("/textures/blocks/", "/textures/block/")
        .replace("/textures/items/", "/textures/item/");
    let marker = format!("/textures/{folder}/");
    let idx = normalized.find(&marker)? + marker.len();
    let rel = normalized[idx..].strip_suffix(".png")?;
    let ns = normalized
        .strip_prefix("assets/")?
        .split('/')
        .next()?
        .to_string();
    if !rel.contains('/') {
        return Some((ns, kind, rel.to_string(), true));
    }
    let parts: Vec<&str> = rel.split('/').collect();
    let stem = parts[parts.len().saturating_sub(2)].to_string();
    Some((ns, kind, stem, false))
}

fn synthetic_texture_path(namespace: &str, kind: CatalogEntryKind, stem: &str) -> String {
    let folder = match kind {
        CatalogEntryKind::Block => "block",
        CatalogEntryKind::Item => "item",
    };
    format!("assets/{namespace}/textures/{folder}/{stem}.png")
}

pub fn is_block_item_texture_path(path: &str) -> bool {
    let path = path.replace('\\', "/");
    path.contains("/textures/block/")
        || path.contains("/textures/item/")
        || path.contains("/textures/blocks/")
        || path.contains("/textures/items/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::classify::classify_path;
    use crate::source::{AssetSource, FolderSource};

    #[test]
    fn finds_flat_and_multiface_textures() {
        let paths: HashSet<String> = [
            "assets/ic2/textures/block/batbox.png",
            "assets/ic2/textures/block/electric/energy_storage/batbox/north.png",
            "assets/ic2/textures/item/minecart/batbox.png",
        ]
        .into_iter()
        .map(String::from)
        .collect();

        assert_eq!(
            find_representative_texture("ic2", CatalogEntryKind::Block, "batbox", &paths).as_deref(),
            Some("assets/ic2/textures/block/batbox.png")
        );
        let multiface: HashSet<String> = ["assets/ic2/textures/block/electric/energy_storage/batbox/north.png"]
            .into_iter()
            .map(String::from)
            .collect();
        assert_eq!(
            find_representative_texture("ic2", CatalogEntryKind::Block, "batbox", &multiface).as_deref(),
            Some("assets/ic2/textures/block/electric/energy_storage/batbox/north.png")
        );
    }

    #[test]
    fn builds_texture_catalog_from_split_lang_files() {
        let root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/texture_only_pack");
        let source = FolderSource::new(&root).expect("source");
        let entries: Vec<AssetEntry> = source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|p| classify_path(&p))
            .collect();
        let lang = super::super::lang::build_lang_resolver(&entries, Some(&source));
        let catalog = build_texture_catalog_fallback(
            &lang,
            &entries,
            CatalogBuildOptions {
                language: "en_us",
                ..Default::default()
            },
        );

        assert!(!catalog.is_empty());
        let batbox = catalog.iter().find(|e| e.id == "ic2:batbox").expect("batbox");
        assert_eq!(batbox.display_name, "BatBox");
        assert_eq!(batbox.resolve_kind, CatalogResolveKind::Texture);
        assert!(!batbox.texture_paths.is_empty());
    }
}
