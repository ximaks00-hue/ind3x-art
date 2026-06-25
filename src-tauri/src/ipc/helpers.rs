use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};

use tauri::Emitter;

use crate::catalog::CreativeTabOrder;
use crate::dto::{AssetEntry, AssetKind, IndexEvent, ProjectHandle, SourceKind};
use crate::error::{log_if_err, CoreError, CoreResult};
use crate::index::{
    fingerprint_after_disk_change, invalidate_index, patch_entries_for_paths, prune_orphan_entries,
    run_index, scan_index_entries, source_fingerprint, texture_index,
};
use crate::model::normalize::{read_pack_info, PackInfo};
use crate::resolve::ModelRegistry;
use crate::source::open_source as load_source;
use crate::state::{
    lock_model_cache, read_project, write_project, CatalogState, IndexState, Project, SaveState,
    SharedState,
};

pub(crate) const INDEX_EVENT: &str = "index-event";

fn clone_index_state(index: &IndexState) -> IndexState {
    IndexState {
        fingerprint: index.fingerprint.clone(),
        entries: index.entries.clone(),
        entry_id_index: index.entry_id_index.clone(),
        texture_model_index: index.texture_model_index.clone(),
        model_cache: Mutex::new(
            index
                .model_cache
                .lock()
                .map(|cache| cache.clone())
                .unwrap_or_default(),
        ),
    }
}

fn clone_catalog_state(catalog: &CatalogState) -> CatalogState {
    CatalogState {
        entries: catalog.entries.clone(),
        id_index: catalog.id_index.clone(),
        creative_tab_order: catalog.creative_tab_order.clone(),
        language: catalog.language.clone(),
    }
}

/// Clone project state for heavy refresh/reindex work outside the per-project write lock.
pub(crate) fn clone_project_for_off_lock_work(project: &Project) -> CoreResult<Project> {
    Ok(Project {
        source_path: project.source_path.clone(),
        source_kind: project.source_kind,
        pack_format: project.pack_format,
        source: load_source(&project.source_path)?,
        index: clone_index_state(&project.index),
        catalog: clone_catalog_state(&project.catalog),
        save: SaveState {
            journal: project.save.journal.clone(),
        },
    })
}

/// Publish off-lock results under a brief write lock.
pub(crate) fn publish_project_work_result(dst: &mut Project, src: Project) {
    dst.source = src.source;
    dst.pack_format = src.pack_format;
    dst.index = src.index;
    dst.catalog = src.catalog;
    dst.save.journal = src.save.journal;
}

pub(crate) fn touch_ipc_request(state: &SharedState, request_id: Option<u64>) -> CoreResult<()> {
    let Some(request_id) = request_id else {
        return Ok(());
    };
    {
        let mut app = state.write()?;
        app.register_ipc_request(request_id);
    }
    let app = state.read()?;
    if app.is_ipc_request_cancelled(request_id) {
        return Err(CoreError::Cancelled);
    }
    Ok(())
}

pub(crate) fn finish_ipc_request_opt(state: &SharedState, request_id: Option<u64>) {
    if let Some(request_id) = request_id {
        if let Ok(mut app) = state.write() {
            app.finish_ipc_request(request_id);
        }
    }
}

pub(crate) fn emit_index_event(app: &tauri::AppHandle, event: IndexEvent) {
    let _ = app.emit(INDEX_EVENT, event);
}

pub(crate) fn send_index_event(
    app: Option<&tauri::AppHandle>,
    channel: &tauri::ipc::Channel<IndexEvent>,
    event: IndexEvent,
) {
    if let Some(app) = app {
        emit_index_event(app, event);
        return;
    }
    let _ = channel.send(event);
}

pub(crate) fn pack_for_project(project: &crate::state::Project) -> PackInfo {
    PackInfo {
        pack_format: project.pack_format,
    }
}

pub(crate) fn refresh_entry_id_index(project: &mut crate::state::Project) {
    project.index.entry_id_index = project
        .index
        .entries
        .iter()
        .enumerate()
        .map(|(idx, entry)| (entry.id.clone(), idx))
        .collect();
}

pub(crate) fn rebuild_texture_model_index(project: &mut crate::state::Project) -> CoreResult<()> {
    let pack = pack_for_project(project);
    let entries = &project.index.entries;
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    let mut registry = ModelRegistry::new(project.source.as_ref(), &mut cache, pack);
    project.index.texture_model_index =
        texture_index::build_texture_model_index(&mut registry, entries);
    drop(cache);
    refresh_entry_id_index(project);
    apply_texture_link_counts(project);
    Ok(())
}

fn evict_model_cache_for_paths(
    cache: &mut HashMap<String, std::sync::Arc<crate::model::types::ResolvedModel>>,
    changed_paths: &[String],
) {
    use crate::model::types::{blockstate_id_from_asset_path, model_id_from_asset_path};

    for raw in changed_paths {
        let path = raw.replace('\\', "/");
        if let Some((ns, model_path)) = model_id_from_asset_path(&path) {
            cache.remove(&format!("{ns}:{model_path}"));
        }
        if let Some((ns, block_name)) = blockstate_id_from_asset_path(&path) {
            cache.remove(&format!("{ns}:{block_name}"));
        }
    }
}

pub(crate) fn patch_texture_model_index_for_paths(
    project: &mut crate::state::Project,
    changed_paths: &[String],
) -> CoreResult<()> {
    if !texture_index::paths_affect_texture_model_index(changed_paths) {
        return Ok(());
    }
    let pack = pack_for_project(project);
    let mut cache = lock_model_cache(&project.index.model_cache)?;
    evict_model_cache_for_paths(&mut cache, changed_paths);
    let mut registry = ModelRegistry::new(project.source.as_ref(), &mut cache, pack);
    texture_index::patch_texture_model_index(
        &mut registry,
        &project.index.entries,
        &mut project.index.texture_model_index,
        changed_paths,
    );
    drop(cache);
    apply_texture_link_counts(project);
    Ok(())
}

pub(crate) fn apply_texture_link_counts(project: &mut crate::state::Project) {
    let index = &project.index.texture_model_index;
    for entry in &mut project.index.entries {
        if entry.kind == AssetKind::Texture {
            let count =
                texture_index::models_for_texture_path(index, &entry.path).len() as u32;
            entry.linked_model_count = Some(count);
        }
    }
}

pub(crate) struct OpenPreparedProject {
    pub from_cache: bool,
    pub catalog_from_cache: bool,
    pub pack_format: Option<u32>,
    pub catalog: Vec<crate::dto::CatalogEntry>,
    pub creative_tab_order: CreativeTabOrder,
    pub source: Box<dyn crate::source::AssetSource>,
    #[allow(dead_code)]
    pub fingerprint: String,
    pub catalog_language: String,
    pub index: IndexState,
}

pub(crate) fn prepare_opened_project(
    source_path: &std::path::Path,
    source_kind: SourceKind,
    fingerprint: String,
    db: &sled::Db,
    cancel: &std::sync::Arc<std::sync::atomic::AtomicBool>,
    on_event: &tauri::ipc::Channel<IndexEvent>,
    app: Option<&tauri::AppHandle>,
) -> CoreResult<OpenPreparedProject> {
    let source = load_source(source_path)?;
    let (entries, mut from_cache) = run_index(
        source.as_ref(),
        db,
        &fingerprint,
        cancel,
        on_event,
        app,
        false,
    )?;
    let pack_info = read_pack_info(source.as_ref());
    let mut project = crate::state::Project {
        source_path: source_path.to_path_buf(),
        source_kind,
        pack_format: pack_info.pack_format,
        source,
        index: crate::state::IndexState {
            fingerprint: fingerprint.clone(),
            entries,
            entry_id_index: HashMap::new(),
            texture_model_index: HashMap::new(),
            model_cache: Mutex::new(HashMap::new()),
        },
        catalog: crate::state::CatalogState {
            entries: Vec::new(),
            id_index: std::collections::HashMap::new(),
            creative_tab_order: CreativeTabOrder::default(),
            language: "en_us".to_string(),
        },
        save: crate::state::SaveState {
            journal: Vec::new(),
        },
    };

    // Stale sled index cache can produce an empty catalog while blockstates/models exist.
    // Cold-scan once before texture/catalog work instead of build → invalidate → cold → build.
    if from_cache && crate::catalog::catalog_needs_rebuild(&project) {
        tracing::warn!(
            entry_count = project.index.entries.len(),
            "cached index produced empty catalog — forcing cold index before catalog build"
        );
        let fp = project.index.fingerprint.clone();
        log_if_err(invalidate_index(db, &fp), "invalidate index for cold rebuild");
        log_if_err(
            crate::catalog::invalidate_project_catalog_cache(db, &fp),
            "invalidate catalog before cold rebuild",
        );
        project.source = load_source(source_path)?;
        let (fresh_entries, fresh_from_cache) = run_index(
            project.source.as_ref(),
            db,
            &fp,
            cancel,
            on_event,
            app,
            true,
        )?;
        from_cache = fresh_from_cache;
        project.index.entries = fresh_entries;
    }

    rebuild_texture_model_index(&mut project)?;
    send_index_event(
        app,
        on_event,
        IndexEvent::Progress {
            scanned: 0,
            total: 1,
            stage: "building catalog".to_string(),
        },
    );

    let mut catalog_from_cache = crate::catalog::build_project_catalog(&mut project, db)?;
    if crate::catalog::catalog_needs_rebuild(&project) {
        let fp = project.index.fingerprint.clone();
        log_if_err(
            crate::catalog::invalidate_project_catalog_cache(db, &fp),
            "invalidate catalog before rebuild",
        );
        catalog_from_cache = crate::catalog::build_project_catalog(&mut project, db)?;
    }

    Ok(OpenPreparedProject {
        from_cache,
        catalog_from_cache,
        pack_format: project.pack_format,
        catalog: project
            .catalog
            .entries
            .iter()
            .map(|e| e.as_ref().clone())
            .collect(),
        creative_tab_order: project.catalog.creative_tab_order,
        source: project.source,
        fingerprint,
        catalog_language: project.catalog.language.clone(),
        index: project.index,
    })
}

pub(crate) fn project_for_handle(
    app: &crate::state::AppState,
    handle: ProjectHandle,
) -> CoreResult<Arc<RwLock<Project>>> {
    crate::state::project_arc(&app.projects, handle.id)
}

pub(crate) fn refresh_index_cache(
    db: &sled::Db,
    old_fingerprint: &str,
    new_fingerprint: &str,
    entries: &[crate::dto::AssetEntry],
) -> CoreResult<()> {
    if old_fingerprint != new_fingerprint {
        log_if_err(invalidate_index(db, old_fingerprint), "invalidate old index cache");
        log_if_err(
            crate::catalog::invalidate_project_catalog_cache(db, old_fingerprint),
            "invalidate old catalog cache",
        );
        log_if_err(
            crate::catalog::icon_cache::invalidate_icon_cache_prefix(db, old_fingerprint),
            "invalidate old icon cache",
        );
    }
    if entries.is_empty() {
        log_if_err(
            invalidate_index(db, new_fingerprint),
            "invalidate empty index cache",
        );
        return Ok(());
    }
    let encoded = serde_json::to_vec(entries)
        .map_err(|e| CoreError::Internal(format!("cache encode failed: {e}")))?;
    db.insert(
        crate::index::cache_key_for(new_fingerprint).as_bytes(),
        encoded,
    )?;
    Ok(())
}

pub(crate) fn indexed_texture_paths(project: &crate::state::Project) -> HashSet<&str> {
    project
        .index
        .entries
        .iter()
        .filter(|entry| entry.kind == AssetKind::Texture)
        .map(|entry| entry.path.as_str())
        .collect()
}

pub(crate) fn require_indexed_texture<'a>(
    project: &'a crate::state::Project,
    path: &str,
) -> CoreResult<&'a AssetEntry> {
    let entry = project
        .index
        .entries
        .iter()
        .find(|e| e.path == path)
        .ok_or_else(|| CoreError::AssetNotFound(path.to_string()))?;
    if entry.kind != AssetKind::Texture {
        return Err(CoreError::InvalidInput("not a texture asset".to_string()));
    }
    Ok(entry)
}

pub(crate) fn invalidate_jar_cache_if_needed(
    source_kind: crate::dto::SourceKind,
    source_path: &std::path::Path,
) {
    if source_kind == crate::dto::SourceKind::Jar {
        if let Ok(jar) = crate::source::JarSource::new(source_path) {
            jar.invalidate_cache();
        }
    }
}

pub(crate) fn ensure_catalog_built(state: &SharedState, handle_id: u64) -> CoreResult<()> {
    if !catalog_needs_build(state, handle_id)? {
        return Ok(());
    }
    ensure_catalog_built_blocking(state, handle_id)
}

pub(crate) fn catalog_needs_build(state: &SharedState, handle_id: u64) -> CoreResult<bool> {
    let app = state.read()?;
    let arc = crate::state::project_arc(&app.projects, handle_id)?;
    let project = read_project(&arc)?;
    Ok(crate::catalog::catalog_needs_rebuild(&project))
}

pub(crate) fn ensure_catalog_built_blocking(state: &SharedState, handle_id: u64) -> CoreResult<()> {
    let db = {
        let app = state.read()?;
        app.db.clone()
    };
    let arc = {
        let app = state.read()?;
        crate::state::project_arc(&app.projects, handle_id)?
    };
    let mut project = write_project(&arc)?;
    if !crate::catalog::catalog_needs_rebuild(&project) {
        return Ok(());
    }
    tracing::warn!(
        entry_count = project.index.entries.len(),
        "catalog empty while index has blockstates/models — rebuilding"
    );
    crate::catalog::build_project_catalog(&mut project, &db)?;
    Ok(())
}

pub(crate) async fn ensure_catalog_built_async(
    state: &SharedState,
    handle_id: u64,
) -> CoreResult<()> {
    if !catalog_needs_build(state, handle_id)? {
        return Ok(());
    }
    let shared = state.clone();
    tauri::async_runtime::spawn_blocking(move || ensure_catalog_built_blocking(&shared, handle_id))
        .await
        .map_err(|e| CoreError::Internal(format!("catalog build task failed: {e}")))?
}

pub(crate) fn refresh_pack_format(project: &mut crate::state::Project) {
    let pack_info = read_pack_info(project.source.as_ref());
    project.pack_format = pack_info.pack_format;
}

/// Incremental index/catalog refresh — no `AppState` lock; safe inside `spawn_blocking`.
pub(crate) fn refresh_project_for_paths_on_project(
    project: &mut crate::state::Project,
    db: &sled::Db,
    changed_paths: &[String],
) -> CoreResult<()> {
    let source_path = project.source_path.clone();
    project.source = load_source(&source_path)?;
    refresh_pack_format(project);
    let old_fp = project.index.fingerprint.clone();
    let new_fp = fingerprint_after_disk_change(
        &source_path,
        project.source_kind,
        &old_fp,
        changed_paths,
    )?;
    patch_entries_for_paths(
        &mut project.index.entries,
        project.source.as_ref(),
        changed_paths,
        None,
        None,
    )?;
    prune_orphan_entries(&mut project.index.entries, project.source.as_ref())?;
    project.index.fingerprint = new_fp.clone();
    if texture_index::paths_affect_texture_model_index(changed_paths) {
        if let Ok(mut cache) = project.index.model_cache.lock() {
            evict_model_cache_for_paths(&mut cache, changed_paths);
        }
        patch_texture_model_index_for_paths(project, changed_paths)?;
    }
    refresh_index_cache(db, &old_fp, &new_fp, &project.index.entries)?;
    if crate::catalog::patch::paths_need_full_catalog_rebuild(changed_paths) {
        crate::catalog::build_project_catalog(project, db)?;
    } else {
        crate::catalog::patch_project_catalog(project, db, changed_paths)?;
    }
    Ok(())
}

/// Full disk resync — no `AppState` lock; safe inside `spawn_blocking`.
pub(crate) fn full_resync_project_on_project(
    project: &mut crate::state::Project,
    db: &sled::Db,
) -> CoreResult<()> {
    let source_path = project.source_path.clone();
    project.source = load_source(&source_path)?;
    refresh_pack_format(project);
    let old_fp = project.index.fingerprint.clone();
    let new_fp = source_fingerprint(&project.source_path)?;
    project.index.entries = scan_index_entries(project.source.as_ref())?;
    project.index.fingerprint = new_fp.clone();
    if let Ok(mut cache) = project.index.model_cache.lock() {
        cache.clear();
    }
    rebuild_texture_model_index(project)?;
    refresh_index_cache(db, &old_fp, &new_fp, &project.index.entries)?;
    log_if_err(
        crate::catalog::invalidate_project_catalog_cache(db, &new_fp),
        "invalidate catalog after full resync",
    );
    log_if_err(
        crate::catalog::icon_cache::invalidate_icon_cache_prefix(db, &new_fp),
        "invalidate icons after full resync",
    );
    crate::catalog::build_project_catalog(project, db)?;
    Ok(())
}

#[allow(dead_code)]
pub(crate) fn refresh_project_for_paths(
    app: &crate::state::AppState,
    db: &sled::Db,
    handle: ProjectHandle,
    changed_paths: &[String],
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let arc = project_for_handle(app, handle)?;
    let mut project = write_project(&arc)?;
    let source_kind = project.source_kind;
    let source_path = project.source_path.clone();
    refresh_project_for_paths_on_project(&mut project, db, changed_paths)?;
    Ok((source_kind, source_path))
}

#[allow(dead_code)]
pub(crate) fn full_resync_project_after_disk_change(
    app: &crate::state::AppState,
    db: &sled::Db,
    handle: ProjectHandle,
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let arc = project_for_handle(app, handle)?;
    let mut project = write_project(&arc)?;
    let source_kind = project.source_kind;
    let source_path = project.source_path.clone();
    full_resync_project_on_project(&mut project, db)?;
    Ok((source_kind, source_path))
}
