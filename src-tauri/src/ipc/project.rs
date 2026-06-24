use std::collections::HashMap;
use std::sync::Mutex;

use tauri::State;

use crate::dto::{AppInfo, IndexEvent, OpenSourceResult, ProjectHandle};
use crate::error::{log_if_err, CoreError, CoreResult};
use crate::index::{
    invalidate_index, patch_entries_for_paths, prune_orphan_entries, run_index, source_fingerprint,
};
use crate::source::open_source as load_source;
use crate::state::SharedState;

use super::helpers::{
    apply_texture_link_counts, prepare_opened_project, refresh_entry_id_index,
    refresh_index_cache, refresh_pack_format, rebuild_texture_model_index,
};

#[tauri::command]
#[specta::specta]
pub fn get_app_info(state: State<'_, SharedState>) -> CoreResult<AppInfo> {
    Ok(state.read()?.app_info())
}

#[tauri::command]
#[specta::specta]
pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
#[specta::specta]
pub fn get_sample_pack_path() -> Result<String, String> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/sample");
    if !path.exists() {
        return Err("Sample pack directory not found".into());
    }
    path.canonicalize()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn open_source(
    path: String,
    on_event: tauri::ipc::Channel<IndexEvent>,
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> CoreResult<OpenSourceResult> {
    let source_path = std::path::PathBuf::from(&path);

    let (handle_id, cancel, db) = {
        let mut app = state.write()?;
        let handle = app.alloc_handle();
        let cancel = app.register_cancel(handle.id);
        let db = app.db.clone();
        (handle.id, cancel, db)
    };

    let path_for_task = source_path.clone();
    let app_for_task = app_handle.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let source = load_source(&path_for_task)?;
        let source_kind = source.source_kind();
        let fingerprint = source_fingerprint(source.source_path())?;
        prepare_opened_project(
            &path_for_task,
            source_kind,
            fingerprint,
            &db,
            &cancel,
            &on_event,
            Some(&app_for_task),
        )
    })
    .await
    .map_err(|e| CoreError::Internal(format!("open task failed: {e}")))??;

    let source_kind = prepared.source.source_kind();

    let (result, watcher_shared) = {
        let mut app = state.write()?;
        let mut catalog_cache_hit = false;
        let catalog_entry_count = prepared.catalog.len() as u64;
        app.projects.insert(
            handle_id,
            crate::state::Project {
                source_path: source_path.clone(),
                source_kind,
                pack_format: prepared.pack_format,
                source: prepared.source,
                index: crate::state::IndexState {
                    fingerprint: prepared.fingerprint.clone(),
                    entries: prepared.entries.clone(),
                    entry_id_index: HashMap::new(),
                    texture_model_index: prepared.texture_model_index,
                    model_cache: Mutex::new(HashMap::new()),
                },
                catalog: {
                    let entries = crate::state::arc_catalog(prepared.catalog);
                    let id_index = crate::state::build_catalog_id_index(&entries);
                    crate::state::CatalogState {
                        entries,
                        id_index,
                        creative_tab_order: prepared.creative_tab_order,
                        language: prepared.catalog_language.clone(),
                    }
                },
                save: crate::state::SaveState {
                    journal: Vec::new(),
                },
            },
        );
        if let Some(project) = app.projects.get_mut(&handle_id) {
            apply_texture_link_counts(project);
            refresh_entry_id_index(project);
            catalog_cache_hit = prepared.catalog_from_cache;
        }
        let res = OpenSourceResult {
            handle: ProjectHandle { id: handle_id },
            source_path: path,
            source_kind,
            entry_count: prepared.entries.len() as u64,
            from_cache: prepared.from_cache,
            catalog_from_cache: catalog_cache_hit,
            catalog_entry_count,
            pack_format: prepared.pack_format,
            catalog_language: prepared.catalog_language,
        };
        (res, std::sync::Arc::clone(&app.watcher))
    };

    crate::watcher::install_watcher(app_handle, handle_id, source_path, source_kind, &watcher_shared);

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn reindex_project(
    handle: ProjectHandle,
    on_event: tauri::ipc::Channel<IndexEvent>,
    changed_paths: Option<Vec<String>>,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::ReindexResult> {
    let shared = state.inner().clone();
    let handle_id = handle.id;

    let (old_fingerprint, cancel, db, source_path, source_kind) = {
        let mut app = shared.write()?;
        if !app.projects.contains_key(&handle_id) {
            return Err(CoreError::ProjectNotFound);
        }
        let cancel = app.register_cancel(handle_id);
        let project = app.projects.get(&handle_id).ok_or(CoreError::ProjectNotFound)?;
        (
            project.index.fingerprint.clone(),
            cancel,
            app.db.clone(),
            project.source_path.clone(),
            project.source_kind,
        )
    };

    tauri::async_runtime::spawn_blocking(move || {
        reindex_project_blocking(
            &shared,
            handle_id,
            changed_paths,
            old_fingerprint,
            cancel,
            db,
            source_path,
            source_kind,
            on_event,
        )
    })
    .await
    .map_err(|e| CoreError::Internal(format!("reindex task failed: {e}")))?
}

fn reindex_project_blocking(
    state: &SharedState,
    handle_id: u64,
    changed_paths: Option<Vec<String>>,
    old_fingerprint: String,
    cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    db: sled::Db,
    source_path: std::path::PathBuf,
    source_kind: crate::dto::SourceKind,
    on_event: tauri::ipc::Channel<IndexEvent>,
) -> CoreResult<crate::dto::ReindexResult> {
    let source = load_source(&source_path)?;
    let new_fingerprint = source_fingerprint(&source_path)?;

    let entries = if let Some(paths) = changed_paths.filter(|p| !p.is_empty()) {
        let mut app = state.write()?;
        let project = app.projects.get_mut(&handle_id).ok_or(CoreError::ProjectNotFound)?;
        let before = project.index.entries.len();
        patch_entries_for_paths(&mut project.index.entries, source.as_ref(), &paths, Some(&on_event))?;
        prune_orphan_entries(&mut project.index.entries, source.as_ref())?;
        if project.index.entries.is_empty() && before > 0 {
            tracing::warn!(
                changed_paths = paths.len(),
                "incremental index patch emptied project — falling back to full reindex"
            );
            drop(app);
            let (full_entries, _) = run_index(
                source.as_ref(),
                &db,
                &new_fingerprint,
                &cancel,
                &on_event,
                None,
                true,
            )?;
            let mut app = state.write()?;
            let project = app.projects.get_mut(&handle_id).ok_or(CoreError::ProjectNotFound)?;
            project.source = source;
            project.index.entries = full_entries.clone();
            project.index.fingerprint = new_fingerprint.clone();
            if let Ok(mut cache) = project.index.model_cache.lock() {
                cache.clear();
            }
            rebuild_texture_model_index(project)?;
            crate::catalog::build_project_catalog(project, &db)?;
            refresh_index_cache(&db, &old_fingerprint, &new_fingerprint, &full_entries)?;
            full_entries.len() as u64
        } else {
            if let Ok(mut cache) = project.index.model_cache.lock() {
                cache.clear();
            }
            project.index.fingerprint = new_fingerprint.clone();
            project.source = source;
            refresh_index_cache(&db, &old_fingerprint, &new_fingerprint, &project.index.entries)?;
            rebuild_texture_model_index(project)?;
            crate::catalog::patch_project_catalog(project, &db, &paths)?;
            project.index.entries.len() as u64
        }
    } else {
        log_if_err(
            invalidate_index(&db, &old_fingerprint),
            "invalidate index for full rescan",
        );
        log_if_err(
            crate::catalog::invalidate_project_catalog_cache(&db, &old_fingerprint),
            "invalidate catalog for full rescan",
        );
        let (entries, _) = run_index(
            source.as_ref(),
            &db,
            &new_fingerprint,
            &cancel,
            &on_event,
            None,
            true,
        )?;

        let mut app = state.write()?;
        let project = app.projects.get_mut(&handle_id).ok_or(CoreError::ProjectNotFound)?;
        project.source = load_source(&source_path)?;
        project.index.entries = entries.clone();
        project.index.fingerprint = new_fingerprint;
        if let Ok(mut cache) = project.index.model_cache.lock() {
            cache.clear();
        }
        rebuild_texture_model_index(project)?;
        crate::catalog::build_project_catalog(project, &db)?;
        entries.len() as u64
    };

    if source_kind == crate::dto::SourceKind::Jar {
        if let Ok(jar) = crate::source::JarSource::new(&source_path) {
            jar.invalidate_cache();
        }
    }

    {
        let mut app = state.write()?;
        if let Some(project) = app.projects.get_mut(&handle_id) {
            refresh_pack_format(project);
        }
    }

    Ok(crate::dto::ReindexResult {
        asset_count: entries,
        catalog_count: {
            let app = state.read()?;
            app.projects
                .get(&handle_id)
                .map(|p| p.catalog.entries.len() as u64)
                .unwrap_or(0)
        },
    })
}

#[tauri::command]
#[specta::specta]
pub fn invalidate_project_index(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    invalidate_index(&app.db, &project.index.fingerprint)?;
    crate::catalog::invalidate_project_catalog_cache(&app.db, &project.index.fingerprint)?;
    crate::catalog::icon_cache::invalidate_icon_cache_prefix(&app.db, &project.index.fingerprint)
}

#[tauri::command]
#[specta::specta]
pub fn close_source(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    let mut app = state.write()?;
    app.cancel_index(handle.id);
    app.projects.remove(&handle.id);
    app.clear_cancel(handle.id);
    crate::watcher::stop_watcher(handle.id, &std::sync::Arc::clone(&app.watcher));
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn cancel_index(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    state.read()?.cancel_index(handle.id);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_project_fingerprint(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<String> {
    let app = state.read()?;
    let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
    Ok(project.index.fingerprint.clone())
}
