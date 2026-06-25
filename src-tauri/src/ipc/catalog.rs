use tauri::State;

use crate::dto::{CatalogFacets, PageReq, ProjectHandle, RenderableModel, StudioResolveContext};
use crate::error::{CoreError, CoreResult};
use crate::resolve::ModelRegistry;
use crate::state::{lock_model_cache, read_project, write_project, SharedState};

use super::helpers::{
    ensure_catalog_built_async, ensure_catalog_built_blocking, finish_ipc_request_opt,
    pack_for_project, project_for_handle, touch_ipc_request,
};

#[tauri::command]
#[specta::specta]
pub async fn query_catalog(
    handle: ProjectHandle,
    filter: crate::dto::CatalogFilter,
    page: PageReq,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogPage> {
    touch_ipc_request(&state, ipc_request_id)?;
    ensure_catalog_built_async(&state, handle.id).await?;
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let app = shared.read()?;
        let arc = project_for_handle(&app, handle_for_task)?;
        let project = read_project(&arc)?;
        Ok(crate::catalog::query_catalog(
            &project.catalog.entries,
            filter,
            page,
            Some(&project.catalog.creative_tab_order),
        ))
    })
    .await
    .map_err(|e| CoreError::Internal(format!("query_catalog task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn get_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogEntry> {
    touch_ipc_request(&state, ipc_request_id)?;
    ensure_catalog_built_async(&state, handle.id).await?;
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    let entry_id_for_task = entry_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let app = shared.read()?;
        let arc = project_for_handle(&app, handle_for_task)?;
        let project = read_project(&arc)?;
        crate::catalog::get_catalog_entry_indexed(
            &project.catalog.entries,
            &project.catalog.id_index,
            &entry_id_for_task,
        )
        .cloned()
        .ok_or_else(|| CoreError::AssetNotFound(entry_id_for_task))
    })
    .await
    .map_err(|e| CoreError::Internal(format!("get_catalog_entry task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
}

const MAX_CATALOG_ENTRY_BATCH: usize = 128;

#[tauri::command]
#[specta::specta]
pub async fn get_catalog_entries_batch(
    handle: ProjectHandle,
    entry_ids: Vec<String>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<crate::dto::CatalogEntry>> {
    touch_ipc_request(&state, ipc_request_id)?;
    if entry_ids.len() > MAX_CATALOG_ENTRY_BATCH {
        return Err(CoreError::InvalidInput(format!(
            "batch size {} exceeds limit of {MAX_CATALOG_ENTRY_BATCH}",
            entry_ids.len()
        )));
    }
    ensure_catalog_built_async(&state, handle.id).await?;
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let app = shared.read()?;
        let arc = project_for_handle(&app, handle_for_task)?;
        let project = read_project(&arc)?;
        let mut out = Vec::with_capacity(entry_ids.len());
        for entry_id in entry_ids {
            if let Some(entry) = crate::catalog::get_catalog_entry_indexed(
                &project.catalog.entries,
                &project.catalog.id_index,
                &entry_id,
            ) {
                out.push(entry.clone());
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| CoreError::Internal(format!("get_catalog_entries_batch task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn get_catalog_facets(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<CatalogFacets> {
    ensure_catalog_built_async(&state, handle.id).await?;
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app = shared.read()?;
        let arc = project_for_handle(&app, handle_for_task)?;
        let project = read_project(&arc)?;
        Ok(crate::catalog::catalog_facets(&project.catalog.entries))
    })
    .await
    .map_err(|e| CoreError::Internal(format!("get_catalog_facets task failed: {e}")))?
}

fn resolve_catalog_entry_blocking(
    state: &SharedState,
    handle_id: u64,
    entry_id: &str,
    context: StudioResolveContext,
    variant_key: Option<String>,
) -> CoreResult<RenderableModel> {
    ensure_catalog_built_blocking(state, handle_id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, ProjectHandle { id: handle_id })?;
    let project = read_project(&arc)?;
    let entry = crate::catalog::get_catalog_entry_indexed(
        &project.catalog.entries,
        &project.catalog.id_index,
        entry_id,
    )
    .ok_or_else(|| CoreError::AssetNotFound(entry_id.to_string()))?
    .clone();
    let source = project.source.as_ref();
    let pack = pack_for_project(&project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);
    let resolved_variant = variant_key.or_else(|| entry.default_variant_key.clone());

    if matches!(context, StudioResolveContext::Icon) {
        crate::catalog::compile_catalog_icon_model(&entry, &mut registry, &pack)
    } else {
        crate::catalog::compile_catalog_placed_model(
            &entry,
            &mut registry,
            &pack,
            resolved_variant.as_deref(),
        )
    }
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    context: StudioResolveContext,
    variant_key: Option<String>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    touch_ipc_request(&state, ipc_request_id)?;
    let shared = state.inner().clone();
    let handle_id = handle.id;
    let entry_id_for_task = entry_id.clone();
    let variant_key_for_task = variant_key.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        resolve_catalog_entry_blocking(
            &shared,
            handle_id,
            &entry_id_for_task,
            context,
            variant_key_for_task,
        )
    })
    .await
    .map_err(|e| CoreError::Internal(format!("resolve_catalog_entry task failed: {e}")))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn rebuild_project_catalog(
    handle: ProjectHandle,
    language: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let shared = state.inner().clone();
    let handle_for_task = handle.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = {
            let app = shared.read()?;
            app.db.clone()
        };
        let arc = {
            let app = shared.read()?;
            project_for_handle(&app, handle_for_task)?
        };
        let mut project = write_project(&arc)?;
        crate::catalog::rebuild_project_catalog(&mut project, &db, &language)?;
        Ok(())
    })
    .await
    .map_err(|e| CoreError::Internal(format!("rebuild_project_catalog task failed: {e}")))?
}

#[tauri::command]
#[specta::specta]
pub fn get_catalog_icon_cache(
    handle: ProjectHandle,
    icon_key: String,
    state: State<'_, SharedState>,
) -> CoreResult<Option<String>> {
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    crate::catalog::icon_cache::load_cached_icon(&app.db, &project.index.fingerprint, &icon_key)
}

const MAX_CATALOG_ICON_CACHE_BATCH: usize = 128;

#[tauri::command]
#[specta::specta]
pub fn get_catalog_icon_cache_batch(
    handle: ProjectHandle,
    icon_keys: Vec<String>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<crate::dto::CatalogIconCacheBatch>> {
    touch_ipc_request(&state, ipc_request_id)?;
    if icon_keys.len() > MAX_CATALOG_ICON_CACHE_BATCH {
        return Err(CoreError::InvalidInput(format!(
            "batch size {} exceeds limit of {MAX_CATALOG_ICON_CACHE_BATCH}",
            icon_keys.len()
        )));
    }
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    let fingerprint = project.index.fingerprint.clone();
    let db = app.db.clone();
    let mut out = Vec::with_capacity(icon_keys.len());
    for icon_key in icon_keys {
        touch_ipc_request(&state, ipc_request_id)?;
        let png_base64 =
            crate::catalog::icon_cache::load_cached_icon(&db, &fingerprint, &icon_key)?;
        out.push(crate::dto::CatalogIconCacheBatch {
            icon_key,
            png_base64,
        });
    }
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn set_catalog_icon_cache(
    handle: ProjectHandle,
    icon_key: String,
    png_base64: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (db, fingerprint) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle)?;
        let project = read_project(&arc)?;
        (app.db.clone(), project.index.fingerprint.clone())
    };
    crate::catalog::icon_cache::save_cached_icon(&db, &fingerprint, &icon_key, &png_base64)
}

#[tauri::command]
#[specta::specta]
pub fn invalidate_catalog_icons_for_textures(
    handle: ProjectHandle,
    texture_paths: Vec<String>,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<String>> {
    if texture_paths.is_empty() {
        return Ok(Vec::new());
    }
    let (db, fingerprint, icon_keys) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle)?;
        let project = read_project(&arc)?;
        let path_set: std::collections::HashSet<String> = texture_paths.into_iter().collect();
        let icon_keys: Vec<String> = project
            .catalog
            .entries
            .iter()
            .filter(|entry| {
                entry
                    .texture_paths
                    .iter()
                    .any(|p| path_set.contains(p))
            })
            .map(|entry| entry.icon_key.clone())
            .collect();
        (app.db.clone(), project.index.fingerprint.clone(), icon_keys)
    };
    if !icon_keys.is_empty() {
        crate::catalog::icon_cache::invalidate_icon_cache_keys(&db, &fingerprint, &icon_keys)?;
    }
    Ok(icon_keys)
}
