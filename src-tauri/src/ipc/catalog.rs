use tauri::State;

use crate::dto::{CatalogFacets, PageReq, ProjectHandle, RenderableModel, StudioResolveContext};
use crate::error::{CoreError, CoreResult};
use crate::resolve::ModelRegistry;
use crate::state::{lock_model_cache, SharedState};

use super::helpers::{ensure_catalog_built, pack_for_project};

#[tauri::command]
#[specta::specta]
pub fn query_catalog(
    handle: ProjectHandle,
    filter: crate::dto::CatalogFilter,
    page: PageReq,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogPage> {
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    Ok(crate::catalog::query_catalog(
        &project.catalog.entries,
        filter,
        page,
        Some(&project.catalog.creative_tab_order),
    ))
}

#[tauri::command]
#[specta::specta]
pub fn get_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::CatalogEntry> {
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    crate::catalog::get_catalog_entry(&project.catalog.entries, &entry_id)
        .cloned()
        .ok_or_else(|| CoreError::AssetNotFound(entry_id))
}

#[tauri::command]
#[specta::specta]
pub fn get_catalog_facets(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<CatalogFacets> {
    ensure_catalog_built(&state, handle.id)?;
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    Ok(crate::catalog::catalog_facets(&project.catalog.entries))
}

#[tauri::command]
#[specta::specta]
pub fn resolve_catalog_entry(
    handle: ProjectHandle,
    entry_id: String,
    context: StudioResolveContext,
    variant_key: Option<String>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    ensure_catalog_built(&state, handle.id)?;
    let mut app = state.write()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    let entry = crate::catalog::get_catalog_entry(&project.catalog.entries, &entry_id)
        .ok_or_else(|| CoreError::AssetNotFound(entry_id.clone()))?
        .clone();
    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(source, &mut cache, pack);
    let resolved_variant = variant_key.or_else(|| entry.default_variant_key.clone());

    if matches!(context, StudioResolveContext::Icon) {
        return crate::catalog::compile_catalog_icon_model(&entry, &mut registry, &pack);
    }

    crate::catalog::compile_catalog_placed_model(
        &entry,
        &mut registry,
        &pack,
        resolved_variant.as_deref(),
    )
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
    let mut app = state.write()?;
    let project = app
        .projects
        .get_mut(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;
    crate::catalog::rebuild_project_catalog(project, &db, &language)?;
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
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
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
        let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
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
        let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
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
