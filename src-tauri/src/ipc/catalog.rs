use tauri::State;

use crate::dto::{CatalogFacets, PageReq, ProjectHandle, RenderableModel, StudioResolveContext};
use crate::error::{CoreError, CoreResult};
use crate::resolve::ModelRegistry;
use crate::state::{lock_model_cache, read_project, write_project, SharedState};

use super::helpers::{ensure_catalog_built, finish_ipc_request_opt, pack_for_project, project_for_handle, touch_ipc_request};

#[tauri::command]
#[specta::specta]
pub fn query_catalog(
    handle: ProjectHandle,
    filter: crate::dto::CatalogFilter,
    page: PageReq,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogPage> {
    touch_ipc_request(&state, ipc_request_id)?;
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    let page = crate::catalog::query_catalog(
        &project.catalog.entries,
        filter,
        page,
        Some(&project.catalog.creative_tab_order),
    );
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(page)
}

#[tauri::command]
#[specta::specta]
pub fn get_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogEntry> {
    touch_ipc_request(&state, ipc_request_id)?;
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    let entry = crate::catalog::get_catalog_entry_indexed(
        &project.catalog.entries,
        &project.catalog.id_index,
        &entry_id,
    )
    .cloned()
    .ok_or_else(|| CoreError::AssetNotFound(entry_id))?;
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(entry)
}

#[tauri::command]
#[specta::specta]
pub fn get_catalog_facets(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<CatalogFacets> {
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    Ok(crate::catalog::catalog_facets(&project.catalog.entries))
}

#[tauri::command]
#[specta::specta]
pub fn resolve_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    context: StudioResolveContext,
    variant_key: Option<String>,
    ipc_request_id: Option<u64>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    touch_ipc_request(&state, ipc_request_id)?;
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    let entry = crate::catalog::get_catalog_entry_indexed(
        &project.catalog.entries,
        &project.catalog.id_index,
        &entry_id,
    )
    .ok_or_else(|| CoreError::AssetNotFound(entry_id.clone()))?
    .clone();
    let source = project.source.as_ref();
    let pack = pack_for_project(&project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);
    let resolved_variant = variant_key.or_else(|| entry.default_variant_key.clone());

    let model = if matches!(context, StudioResolveContext::Icon) {
        crate::catalog::compile_catalog_icon_model(&entry, &mut registry, &pack)?
    } else {
        crate::catalog::compile_catalog_placed_model(
            &entry,
            &mut registry,
            &pack,
            resolved_variant.as_deref(),
        )?
    };
    touch_ipc_request(&state, ipc_request_id)?;
    finish_ipc_request_opt(&state, ipc_request_id);
    Ok(model)
}

#[tauri::command]
#[specta::specta]
pub fn rebuild_project_catalog(
    handle: ProjectHandle,
    language: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let db = {
        let app = state.read()?;
        app.db.clone()
    };
    let arc = {
        let app = state.read()?;
        project_for_handle(&app, handle)?
    };
    let mut project = write_project(&arc)?;
    crate::catalog::rebuild_project_catalog(&mut project, &db, &language)?;
    Ok(())
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
