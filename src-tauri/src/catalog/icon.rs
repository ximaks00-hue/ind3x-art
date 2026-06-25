use crate::compile::vanilla_gui_display;
use crate::compile::{compile_multipart_renderable, compile_renderable};
use crate::compile::compile_texture_block_preview;
use crate::compile::compile_texture_preview;
use crate::dto::{
    CatalogEntry, CatalogResolveKind, RenderableKind, RenderableModel,
};
use crate::error::{CoreError, CoreResult};
use crate::model::multipart::{parse_variant_state, resolve_multipart_models};
use crate::model::normalize::PackInfo;
use crate::model::types::{
    blockstate_id_from_asset_path, model_id_from_asset_path, normalize_model_ref,
    RawVariantModel,
};
use crate::resolve::{collect_variant_models, ModelRegistry};

/// Compile a catalog entry for inventory icon rendering (GUI slot, 3D bake).
pub fn compile_catalog_icon_model(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) -> CoreResult<RenderableModel> {
    let mut model = match entry.resolve_kind {
        CatalogResolveKind::Blockstate => compile_blockstate_icon(entry, registry, pack)?,
        CatalogResolveKind::Model => compile_model_icon(entry, registry, pack)?,
        CatalogResolveKind::Texture => {
            let path = entry
                .texture_paths
                .first()
                .cloned()
                .unwrap_or_else(|| entry.studio_model_path.clone());
            compile_texture_preview(&path, registry)?
        }
    };
    ensure_gui_display(&mut model);
    Ok(model)
}

/// Studio viewport / world placement — no forced GUI transform.
pub fn compile_catalog_placed_model(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
    variant_key: Option<&str>,
) -> CoreResult<RenderableModel> {
    match entry.resolve_kind {
        CatalogResolveKind::Blockstate => {
            compile_blockstate_placed(entry, registry, pack, variant_key)
        }
        CatalogResolveKind::Model => compile_model_placed(entry, registry, pack),
        CatalogResolveKind::Texture => {
            let path = entry
                .texture_paths
                .first()
                .cloned()
                .unwrap_or_else(|| entry.studio_model_path.clone());
            compile_texture_block_preview(&path, registry)
        }
    }
}

fn compile_model_placed(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) -> CoreResult<RenderableModel> {
    let path = entry.studio_model_path.as_str();
    let (ns, model_path) = model_id_from_asset_path(path)
        .ok_or_else(|| CoreError::InvalidInput(format!("invalid studio model path: {path}")))?;
    let resolved = registry.resolve_model(&ns, &model_path)?;
    compile_renderable(&resolved, &ns, None, pack, registry)
}

fn compile_blockstate_placed(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
    variant_key: Option<&str>,
) -> CoreResult<RenderableModel> {
    let (ns, block_name) = blockstate_id_from_asset_path(&entry.studio_model_path)
        .ok_or_else(|| CoreError::InvalidInput("invalid blockstate path".to_string()))?;
    let blockstate = registry.load_blockstate(&ns, &block_name)?;

    if blockstate.multipart.is_some() && blockstate.variants.is_empty() {
        let state = variant_key
            .or(entry.default_variant_key.as_deref())
            .map(parse_variant_state)
            .unwrap_or_default();
        let variants = resolve_multipart_models(&blockstate, &state);
        if variants.is_empty() {
            return Err(CoreError::InvalidInput(
                "no multipart models matched".to_string(),
            ));
        }
        return compile_multipart_renderable(registry, &ns, &variants, pack);
    }

    let variants = collect_variant_models(&blockstate);
    let preferred = variant_key.or(entry.default_variant_key.as_deref());
    let (variant, _) = pick_variant(&variants, preferred)
        .ok_or_else(|| CoreError::InvalidInput("no blockstate variant for studio".to_string()))?;
    let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
    let resolved = registry.resolve_model(&m_ns, &m_path)?;
    compile_renderable(&resolved, &m_ns, Some(variant), pack, registry)
}

fn compile_model_icon(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) -> CoreResult<RenderableModel> {
    let path = entry
        .icon_model_path
        .as_deref()
        .unwrap_or(entry.studio_model_path.as_str());
    let (ns, model_path) = model_id_from_asset_path(path)
        .ok_or_else(|| CoreError::InvalidInput(format!("invalid icon model path: {path}")))?;
    let resolved = registry.resolve_model(&ns, &model_path)?;
    compile_renderable(&resolved, &ns, None, pack, registry)
}

fn compile_blockstate_icon(
    entry: &CatalogEntry,
    registry: &mut ModelRegistry<'_>,
    pack: &PackInfo,
) -> CoreResult<RenderableModel> {
    if let Some(ref item_path) = entry.icon_model_path {
        if item_path.contains("/models/item/") {
            return compile_model_icon(
                &CatalogEntry {
                    icon_model_path: Some(item_path.clone()),
                    studio_model_path: item_path.clone(),
                    resolve_kind: CatalogResolveKind::Model,
                    ..entry.clone()
                },
                registry,
                pack,
            );
        }
    }

    let (ns, block_name) = blockstate_id_from_asset_path(&entry.studio_model_path)
        .ok_or_else(|| CoreError::InvalidInput("invalid blockstate path".to_string()))?;
    let blockstate = registry.load_blockstate(&ns, &block_name)?;
    let variants = collect_variant_models(&blockstate);
    let variant_key = entry.default_variant_key.as_deref();
    let (variant, _) = pick_variant(&variants, variant_key)
        .ok_or_else(|| CoreError::InvalidInput("no blockstate variant for icon".to_string()))?;
    let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
    let resolved = registry.resolve_model(&m_ns, &m_path)?;
    let mut model = compile_renderable(&resolved, &m_ns, Some(variant), pack, registry)?;
    // Block cubes in inventory use item-style GUI transform (not world block rotation).
    if model.kind == RenderableKind::Block {
        model.kind = RenderableKind::ItemModel;
    }
    Ok(model)
}

fn pick_variant<'a>(
    variants: &'a [(RawVariantModel, String)],
    preferred: Option<&str>,
) -> Option<&'a (RawVariantModel, String)> {
    if let Some(key) = preferred {
        if let Some(found) = variants.iter().find(|(_, k)| k == key) {
            return Some(found);
        }
    }
    variants.first()
}

fn ensure_gui_display(model: &mut RenderableModel) {
    if !model.display.contains_key("gui") {
        model.display.insert("gui".to_string(), vanilla_gui_display());
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::catalog::builder::build_from_entries;
    use crate::dto::{CatalogEntryKind, CatalogPresentation};
    use crate::index::classify::classify_path;
    use crate::resolve::ModelRegistry;
    use crate::source::{AssetSource, FolderSource};

    use super::*;

    fn fixture_catalog(root: &str) -> (FolderSource, Vec<crate::dto::CatalogEntry>) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(root);
        let source = FolderSource::new(&path).expect("source");
        let entries: Vec<_> = source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|p| classify_path(&p))
            .collect();
        let catalog = build_from_entries(&entries, Some(&source));
        (source, catalog)
    }

    #[test]
    fn block_icon_has_gui_display() {
        let (source, catalog) = fixture_catalog("../tests/fixtures/simple_pack");
        let stone = catalog
            .iter()
            .find(|e| e.id.contains("test_stone"))
            .expect("stone");
        let pack = PackInfo::default();
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack);
        let model = compile_catalog_icon_model(stone, &mut registry, &pack).expect("icon");
        assert!(model.display.contains_key("gui"));
        assert!(
            !model.cuboids.is_empty() || model.kind == RenderableKind::ItemGenerated,
            "block icons use 3D cube or item/generated extrusion"
        );
    }

    #[test]
    fn placed_multipart_fence_assembles_parts() {
        use crate::dto::RenderableKind;

        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/multipart_pack");
        let source = FolderSource::new(&path).expect("source");
        let entries: Vec<_> = source
            .list_entries()
            .expect("list")
            .into_iter()
            .filter_map(|p| classify_path(&p))
            .collect();
        let catalog = build_from_entries(&entries, Some(&source));
        let fence = catalog
            .iter()
            .find(|e| e.id.contains("test_fence"))
            .expect("fence");
        let pack = PackInfo::default();
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack);
        let model = compile_catalog_placed_model(fence, &mut registry, &pack, Some("north=true"))
            .expect("placed multipart");
        assert_eq!(model.kind, RenderableKind::Multipart);
        assert!(model.cuboids.len() >= 2);
    }

    #[test]
    fn item_sword_icon_is_item_generated_or_model() {
        let (source, catalog) = fixture_catalog("../tests/fixtures/lang_pack");
        let sword = catalog
            .iter()
            .find(|e| e.id.contains("test_sword"))
            .expect("sword");
        assert_eq!(sword.kind, CatalogEntryKind::Item);
        assert_eq!(sword.presentation, CatalogPresentation::Tool);
        let pack = PackInfo::default();
        let mut cache = std::collections::HashMap::new();
        let mut registry = ModelRegistry::new(&source, &mut cache, pack);
        let model = compile_catalog_icon_model(sword, &mut registry, &pack).expect("icon");
        assert!(model.display.contains_key("gui"));
        assert!(
            model.kind == RenderableKind::ItemGenerated || model.kind == RenderableKind::ItemModel,
            "handheld item should be item model or generated extrusion"
        );
    }
}
