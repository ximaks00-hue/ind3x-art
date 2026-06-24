use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::compile::{
    compile_multipart_renderable, compile_renderable, compile_texture_preview, list_variant_keys,
};
use crate::dto::{
    AssetDetails, AssetFacets, AssetFilter, AssetKind, AssetPage, ModelRefInfo, PageReq,
    ProjectHandle, RenderableModel, TexturePreview, TexturePreviewBatch, VariantKey,
};
use crate::error::{CoreError, CoreResult};
use crate::image::{decode_texture_preview, encode_texture_full};
use crate::index::texture_index;
use crate::model::multipart::{parse_variant_state, resolve_multipart_models};
use crate::model::types::{
    blockstate_id_from_asset_path, model_id_from_asset_path, normalize_model_ref,
    texture_stem_from_entry_path,
};
use crate::resolve::{collect_variant_models, find_models_for_texture, ModelRegistry};
use crate::source::safe_join_under_root;
use crate::state::{lock_model_cache, SharedState};

use super::helpers::{
    indexed_texture_paths, pack_for_project, project_for_handle, require_indexed_texture,
};

#[tauri::command]
#[specta::specta]
pub fn query_assets(
    handle: ProjectHandle,
    filter: AssetFilter,
    page: PageReq,
    state: State<'_, SharedState>,
) -> CoreResult<AssetPage> {
    state
        .read()?
        .query_assets(handle.id, filter, page)
        .ok_or(CoreError::ProjectNotFound)
}

#[tauri::command]
#[specta::specta]
pub fn get_asset_facets(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<AssetFacets> {
    state
        .read()?
        .asset_facets(handle.id)
        .ok_or(CoreError::ProjectNotFound)
}

#[tauri::command]
#[specta::specta]
pub fn get_asset_entry(
    handle: ProjectHandle,
    asset_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::AssetEntry> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    crate::asset_details::find_entry_by_id(project, &asset_id)
}

#[tauri::command]
#[specta::specta]
pub fn get_asset_details(
    handle: ProjectHandle,
    asset_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<AssetDetails> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    let entry = crate::asset_details::find_entry_by_id(project, &asset_id)?;
    crate::asset_details::build_asset_details(project, &entry)
}

#[tauri::command]
#[specta::specta]
pub fn get_texture_previews_batch(
    handle: ProjectHandle,
    asset_paths: Vec<String>,
    max_size: Option<u32>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<TexturePreviewBatch>> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    let valid_textures = indexed_texture_paths(project);
    let size = max_size.unwrap_or(32);
    let mut out = Vec::with_capacity(asset_paths.len());
    for path in asset_paths {
        let preview = if valid_textures.contains(path.as_str()) {
            project
                .source
                .read(&path)
                .ok()
                .and_then(|bytes| decode_texture_preview(&bytes, size).ok())
        } else {
            None
        };
        out.push(TexturePreviewBatch { path, preview });
    }
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn reveal_asset_in_folder(
    handle: ProjectHandle,
    asset_path: String,
    app: tauri::AppHandle,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let app_state = state.read()?;
    let project = app_state
        .projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;

    match project.source_kind {
        crate::dto::SourceKind::Folder => {
            let abs = safe_join_under_root(&project.source_path, &asset_path)?;
            let reveal = if abs.is_file() {
                abs
            } else {
                abs.parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or(project.source_path.clone())
            };
            app.opener()
                .open_path(reveal.to_string_lossy().to_string(), None::<&str>)
                .map_err(|e| CoreError::Internal(e.to_string()))?;
            Ok(())
        }
        crate::dto::SourceKind::Jar => {
            let parent = project
                .source_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| project.source_path.clone());
            app.opener()
                .open_path(parent.to_string_lossy().to_string(), None::<&str>)
                .map_err(|e| CoreError::Internal(e.to_string()))?;
            Ok(())
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_texture_preview(
    handle: ProjectHandle,
    asset_path: String,
    max_size: Option<u32>,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    let app = state.read()?;
    let project = project_for_handle(&app, handle)?;
    require_indexed_texture(project, &asset_path)?;

    let bytes = project.source.read(&asset_path)?;
    decode_texture_preview(&bytes, max_size.unwrap_or(32))
}

#[tauri::command]
#[specta::specta]
pub fn get_texture(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    let app = state.read()?;
    let project = project_for_handle(&app, handle)?;
    require_indexed_texture(project, &texture_path)?;

    let bytes = project.source.read(&texture_path)?;
    encode_texture_full(&bytes)
}

#[tauri::command]
#[specta::specta]
pub fn get_texture_binary(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<u8>> {
    let app = state.read()?;
    let project = project_for_handle(&app, handle)?;
    require_indexed_texture(project, &texture_path)?;

    let bytes = project.source.read(&texture_path)?;
    crate::save::validate_png(&bytes)?;
    Ok(bytes)
}

#[tauri::command]
#[specta::specta]
pub fn list_variants(
    handle: ProjectHandle,
    asset_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<VariantKey>> {
    let app = state.read()?;
    let project = app
        .projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;

    let (namespace, block_name) = blockstate_id_from_asset_path(&asset_path)
        .ok_or_else(|| CoreError::InvalidInput("not a blockstate path".to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let registry = ModelRegistry::new(source, &mut cache, pack);
    let blockstate = registry.load_blockstate(&namespace, &block_name)?;
    Ok(list_variant_keys(&blockstate))
}

#[tauri::command]
#[specta::specta]
pub fn models_for_texture(
    handle: ProjectHandle,
    asset_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<ModelRefInfo>> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;

    let indexed = texture_index::models_for_texture_path(&project.index.texture_model_index, &asset_path);
    if !indexed.is_empty() {
        return Ok(indexed);
    }

    let texture_stem = texture_stem_from_entry_path(&asset_path);
    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);
    find_models_for_texture(&mut registry, &project.index.entries, &asset_path, &texture_stem)
}

#[tauri::command]
#[specta::specta]
pub fn resolve_renderable(
    handle: ProjectHandle,
    asset_path: String,
    variant_key: Option<String>,
    linked_model_path: Option<String>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;

    let resolve_path = linked_model_path.as_deref().unwrap_or(asset_path.as_str());
    let entry = project
        .index
        .entries
        .iter()
        .find(|e| e.path == resolve_path)
        .ok_or_else(|| CoreError::AssetNotFound(resolve_path.to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);

    match entry.kind {
        AssetKind::Texture => {
            let mut models =
                texture_index::models_for_texture_path(&project.index.texture_model_index, &asset_path);
            if models.is_empty() {
                let texture_stem = texture_stem_from_entry_path(&asset_path);
                models = find_models_for_texture(
                    &mut registry,
                    &project.index.entries,
                    &asset_path,
                    &texture_stem,
                )?;
            }
            if let Some(first) = models.first() {
                let (ns, path) = if let Some((a, b)) = first.model_id.split_once(':') {
                    (a.to_string(), b.to_string())
                } else {
                    (entry.namespace.clone(), first.model_id.clone())
                };
                let resolved = registry.resolve_model(&ns, &path)?;
                compile_renderable(&resolved, &ns, None, &pack, &registry)
            } else {
                compile_texture_preview(&asset_path, &registry)
            }
        }
        AssetKind::BlockModel | AssetKind::ItemModel => {
            let (ns, model_path) = model_id_from_asset_path(&asset_path)
                .ok_or_else(|| CoreError::InvalidInput("invalid model path".to_string()))?;
            let resolved = registry.resolve_model(&ns, &model_path)?;
            compile_renderable(&resolved, &ns, None, &pack, &registry)
        }
        AssetKind::Blockstate => {
            let (ns, block_name) = blockstate_id_from_asset_path(&asset_path)
                .ok_or_else(|| CoreError::InvalidInput("invalid blockstate path".to_string()))?;
            let blockstate = registry.load_blockstate(&ns, &block_name)?;

            if blockstate.multipart.is_some() && blockstate.variants.is_empty() {
                let state = variant_key
                    .as_ref()
                    .map(|key| parse_variant_state(key))
                    .unwrap_or_default();
                let variants = resolve_multipart_models(&blockstate, &state);
                if variants.is_empty() {
                    return Err(CoreError::InvalidInput(
                        "no multipart models matched".to_string(),
                    ));
                }
                return compile_multipart_renderable(&mut registry, &ns, &variants, &pack);
            }

            let variants = collect_variant_models(&blockstate);
            let (variant, _) = variants
                .into_iter()
                .find(|(_, key)| variant_key.as_ref().is_none_or(|vk| vk == key))
                .ok_or_else(|| CoreError::InvalidInput("no variants in blockstate".to_string()))?;
            let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
            let resolved = registry.resolve_model(&m_ns, &m_path)?;
            compile_renderable(&resolved, &m_ns, Some(&variant), &pack, &registry)
        }
        _ => Err(CoreError::InvalidInput(
            "asset kind cannot be rendered".to_string(),
        )),
    }
}
