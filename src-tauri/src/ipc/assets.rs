use base64::{engine::general_purpose::STANDARD, Engine};
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
use crate::image::{clamp_texture_preview_size, decode_texture_preview, encode_texture_full, MAX_TEXTURE_PREVIEW_BATCH};
use crate::index::texture_index;
use crate::model::multipart::{parse_variant_state, resolve_multipart_models};
use crate::model::types::{
    blockstate_id_from_asset_path, model_id_from_asset_path, normalize_model_ref,
};
use crate::resolve::{collect_variant_models, ModelRegistry};
use crate::source::safe_join_under_root;
use crate::state::{lock_model_cache, read_project, write_project, SharedState};

use super::helpers::{
    finish_ipc_request_opt, indexed_texture_paths, pack_for_project, project_for_handle,
    rebuild_texture_model_index, require_indexed_texture, touch_ipc_request,
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
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    crate::asset_details::find_entry_by_id(&project, &asset_id)
}

#[tauri::command]
#[specta::specta]
pub fn get_asset_details(
    handle: ProjectHandle,
    asset_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<AssetDetails> {
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    let entry = crate::asset_details::find_entry_by_id(&project, &asset_id)?;
    crate::asset_details::build_asset_details(&project, &entry)
}

#[tauri::command]
#[specta::specta]
pub async fn get_texture_previews_batch(
    handle: ProjectHandle,
    asset_paths: Vec<String>,
    max_size: Option<u32>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<TexturePreviewBatch>> {
    touch_ipc_request(&state, ipc_request_id)?;
    if asset_paths.len() > MAX_TEXTURE_PREVIEW_BATCH {
        return Err(CoreError::InvalidInput(format!(
            "batch size {} exceeds limit of {}",
            asset_paths.len(),
            MAX_TEXTURE_PREVIEW_BATCH
        )));
    }
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let app = shared.read()?;
        let arc = project_for_handle(&app, handle_for_task)?;
        let project = read_project(&arc)?;
        let valid_textures = indexed_texture_paths(&project);
        let size = clamp_texture_preview_size(max_size);
        let mut out = Vec::with_capacity(asset_paths.len());
        for path in asset_paths {
            let preview = if valid_textures.contains(path.as_str()) {
                match project.source.read(&path) {
                    Ok(bytes) => match decode_texture_preview(&bytes, size) {
                        Ok(preview) => Some(preview),
                        Err(error) => {
                            tracing::debug!(path = %path, %error, "texture preview decode failed");
                            None
                        }
                    },
                    Err(error) => {
                        tracing::debug!(path = %path, %error, "texture read failed for preview batch");
                        None
                    }
                }
            } else {
                None
            };
            out.push(TexturePreviewBatch { path, preview });
        }
        Ok(out)
    })
    .await
    .map_err(|e| CoreError::Internal(format!("get_texture_previews_batch task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
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
    let arc = project_for_handle(&app_state, handle)?;
    let project = read_project(&arc)?;

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
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    touch_ipc_request(&state, ipc_request_id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    require_indexed_texture(&project, &asset_path)?;

    let bytes = project.source.read(&asset_path)?;
    let preview = decode_texture_preview(&bytes, clamp_texture_preview_size(max_size))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(preview)
}

#[tauri::command]
#[specta::specta]
pub fn get_texture(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    require_indexed_texture(&project, &texture_path)?;

    let bytes = project.source.read(&texture_path)?;
    encode_texture_full(&bytes)
}

#[tauri::command]
#[specta::specta]
pub fn get_texture_binary(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<String> {
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    require_indexed_texture(&project, &texture_path)?;

    let bytes = project.source.read(&texture_path)?;
    crate::save::validate_png_header(&bytes)?;
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
#[specta::specta]
pub fn list_variants(
    handle: ProjectHandle,
    asset_path: String,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<VariantKey>> {
    touch_ipc_request(&state, ipc_request_id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;

    let (namespace, block_name) = blockstate_id_from_asset_path(&asset_path)
        .ok_or_else(|| CoreError::InvalidInput("not a blockstate path".to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(&project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let registry = ModelRegistry::new(source, &mut cache, pack);
    let blockstate = registry.load_blockstate(&namespace, &block_name)?;
    let variants = list_variant_keys(&blockstate);
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(variants)
}

#[tauri::command]
#[specta::specta]
pub async fn models_for_texture(
    handle: ProjectHandle,
    asset_path: String,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<ModelRefInfo>> {
    touch_ipc_request(&state, ipc_request_id)?;
    let indexed = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
        texture_index::models_for_texture_path(&project.index.texture_model_index, &asset_path)
    };
    if !indexed.is_empty() {
        finish_ipc_request_opt(&state, ipc_request_id);
        return Ok(indexed);
    }

    let shared = state.inner().clone();
    let handle_id = handle.id;
    let asset_path_for_task = asset_path.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let project_arc = {
            let app = shared.read()?;
            super::helpers::project_for_handle(&app, ProjectHandle { id: handle_id })?
        };
        let mut project = write_project(&project_arc)?;
        super::helpers::rebuild_texture_model_index(&mut project)?;
        Ok(texture_index::models_for_texture_path(
            &project.index.texture_model_index,
            &asset_path_for_task,
        ))
    })
    .await
    .map_err(|e| CoreError::Internal(format!("models_for_texture task failed: {e}")))?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_renderable(
    handle: ProjectHandle,
    asset_path: String,
    variant_key: Option<String>,
    linked_model_path: Option<String>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    touch_ipc_request(&state, ipc_request_id)?;
    let resolve_path = linked_model_path.as_deref().unwrap_or(asset_path.as_str());
    let needs_texture_index_rebuild = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
        let entry = project
            .index
            .entries
            .iter()
            .find(|e| e.path == resolve_path)
            .ok_or_else(|| CoreError::AssetNotFound(resolve_path.to_string()))?;
        entry.kind == AssetKind::Texture
            && texture_index::models_for_texture_path(
                &project.index.texture_model_index,
                &asset_path,
            )
            .is_empty()
    };
    if needs_texture_index_rebuild {
        let shared = state.inner().clone();
        let handle_id = handle.id;
        tauri::async_runtime::spawn_blocking(move || {
            let project_arc = {
                let app = shared.read()?;
                super::helpers::project_for_handle(&app, ProjectHandle { id: handle_id })?
            };
            let mut project = write_project(&project_arc)?;
            rebuild_texture_model_index(&mut project)?;
            Ok::<(), CoreError>(())
        })
        .await
        .map_err(|e| CoreError::Internal(format!("resolve_renderable rebuild failed: {e}")))??;
    }

    let shared = state.inner().clone();
    let handle_id = handle.id;
    let asset_path_for_task = asset_path.clone();
    let variant_key_for_task = variant_key.clone();
    let linked_model_path_for_task = linked_model_path.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        resolve_renderable_blocking(
            &shared,
            handle_id,
            &asset_path_for_task,
            variant_key_for_task.as_deref(),
            linked_model_path_for_task.as_deref(),
        )
    })
    .await
    .map_err(|e| CoreError::Internal(format!("resolve_renderable task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    out
}

#[allow(clippy::too_many_arguments)]
fn resolve_renderable_blocking(
    state: &SharedState,
    handle_id: u64,
    asset_path: &str,
    variant_key: Option<&str>,
    linked_model_path: Option<&str>,
) -> CoreResult<RenderableModel> {
    let resolve_path = linked_model_path.unwrap_or(asset_path);
    let app = state.read()?;
    let arc = project_for_handle(&app, ProjectHandle { id: handle_id })?;
    let project = read_project(&arc)?;

    let entry = project
        .index
        .entries
        .iter()
        .find(|e| e.path == resolve_path)
        .ok_or_else(|| CoreError::AssetNotFound(resolve_path.to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(&project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);

    match entry.kind {
        AssetKind::Texture => {
            let models =
                texture_index::models_for_texture_path(&project.index.texture_model_index, asset_path);
            if let Some(first) = models.first() {
                let (ns, path) = if let Some((a, b)) = first.model_id.split_once(':') {
                    (a.to_string(), b.to_string())
                } else {
                    (entry.namespace.clone(), first.model_id.clone())
                };
                let resolved = registry.resolve_model(&ns, &path)?;
                compile_renderable(&resolved, &ns, None, &pack, &registry)
            } else {
                compile_texture_preview(asset_path, &registry)
            }
        }
        AssetKind::BlockModel | AssetKind::ItemModel => {
            let (ns, model_path) = model_id_from_asset_path(resolve_path)
                .ok_or_else(|| CoreError::InvalidInput("invalid model path".to_string()))?;
            let resolved = registry.resolve_model(&ns, &model_path)?;
            compile_renderable(&resolved, &ns, None, &pack, &registry)
        }
        AssetKind::Blockstate => {
            let (ns, block_name) = blockstate_id_from_asset_path(resolve_path)
                .ok_or_else(|| CoreError::InvalidInput("invalid blockstate path".to_string()))?;
            let blockstate = registry.load_blockstate(&ns, &block_name)?;

            if blockstate.multipart.is_some() && blockstate.variants.is_empty() {
                let state = variant_key
                    .map(parse_variant_state)
                    .unwrap_or_default();
                let variants = resolve_multipart_models(&blockstate, &state);
                if variants.is_empty() {
                    Err(CoreError::InvalidInput(
                        "no multipart models matched".to_string(),
                    ))
                } else {
                    compile_multipart_renderable(&mut registry, &ns, &variants, &pack)
                }
            } else {
                let variants = collect_variant_models(&blockstate);
                let (variant, _) = variants
                    .into_iter()
                    .find(|(_, key)| variant_key.is_none_or(|vk| vk == key))
                    .ok_or_else(|| CoreError::InvalidInput("no variants in blockstate".to_string()))?;
                let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
                let resolved = registry.resolve_model(&m_ns, &m_path)?;
                compile_renderable(&resolved, &m_ns, Some(&variant), &pack, &registry)
            }
        }
        _ => Err(CoreError::InvalidInput(
            "asset kind cannot be rendered".to_string(),
        )),
    }
}
