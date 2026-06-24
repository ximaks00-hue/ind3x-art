use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use tauri::Emitter;

use crate::catalog::CreativeTabOrder;
use crate::dto::{AssetEntry, AssetKind, IndexEvent, ModelRefInfo, ProjectHandle, SourceKind};
use crate::error::{log_if_err, CoreError, CoreResult};
use crate::index::{
    invalidate_index, patch_entries_for_paths, prune_orphan_entries, run_index, scan_index_entries,
    source_fingerprint, texture_index,
};
use crate::model::normalize::{read_pack_info, PackInfo};
use crate::resolve::ModelRegistry;
use crate::source::open_source as load_source;
use crate::state::{lock_model_cache, SharedState};

pub(crate) const INDEX_EVENT: &str = "index-event";

pub(crate) fn emit_index_event(app: &tauri::AppHandle, event: IndexEvent) {
    let _ = app.emit(INDEX_EVENT, event);
}

pub(crate) fn send_index_event(
    app: Option<&tauri::AppHandle>,
    channel: &tauri::ipc::Channel<IndexEvent>,
    event: IndexEvent,
) {
    if let Some(app) = app {
        emit_index_event(app, event.clone());
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
    pub entries: Vec<AssetEntry>,
    pub from_cache: bool,
    pub catalog_from_cache: bool,
    pub pack_format: Option<u32>,
    pub catalog: Vec<crate::dto::CatalogEntry>,
    pub creative_tab_order: CreativeTabOrder,
    pub texture_model_index: HashMap<String, Vec<ModelRefInfo>>,
    pub source: Box<dyn crate::source::AssetSource>,
    pub fingerprint: String,
    pub catalog_language: String,
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
    let (mut entries, mut from_cache) = run_index(
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
            entries: entries.clone(),
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
    if project.catalog.entries.is_empty() && crate::catalog::catalog_needs_rebuild(&project) {
        tracing::warn!(
            entry_count = project.index.entries.len(),
            "texture pack catalog still empty — forcing cold index + catalog rebuild"
        );
        let fp = project.index.fingerprint.clone();
        log_if_err(invalidate_index(db, &fp), "invalidate index for cold rebuild");
        log_if_err(
            crate::catalog::invalidate_project_catalog_cache(db, &fp),
            "invalidate catalog before rebuild",
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
        entries = fresh_entries.clone();
        project.index.entries = fresh_entries;
        rebuild_texture_model_index(&mut project)?;
        send_index_event(
            app,
            on_event,
            IndexEvent::Progress {
                scanned: 0,
                total: 1,
                stage: "rebuilding catalog".to_string(),
            },
        );
        catalog_from_cache = crate::catalog::build_project_catalog(&mut project, db)?;
    }
    Ok(OpenPreparedProject {
        entries,
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
        texture_model_index: project.index.texture_model_index,
        source: project.source,
        fingerprint,
        catalog_language: project.catalog.language.clone(),
    })
}

pub(crate) fn project_for_handle(
    app: &crate::state::AppState,
    handle: ProjectHandle,
) -> CoreResult<&crate::state::Project> {
    app.projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)
}

pub(crate) fn project_for_handle_mut(
    app: &mut crate::state::AppState,
    handle: ProjectHandle,
) -> CoreResult<&mut crate::state::Project> {
    app.projects
        .get_mut(&handle.id)
        .ok_or(CoreError::ProjectNotFound)
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
    let needs = {
        let app = state.read()?;
        let project = app
            .projects
            .get(&handle_id)
            .ok_or(CoreError::ProjectNotFound)?;
        crate::catalog::catalog_needs_rebuild(project)
    };
    if !needs {
        return Ok(());
    }
    let db = {
        let app = state.read()?;
        app.db.clone()
    };
    let mut app = state.write()?;
    let project = app
        .projects
        .get_mut(&handle_id)
        .ok_or(CoreError::ProjectNotFound)?;
    tracing::warn!(
        entry_count = project.index.entries.len(),
        "catalog empty while index has blockstates/models — rebuilding"
    );
    crate::catalog::build_project_catalog(project, &db)?;
    Ok(())
}

pub(crate) fn refresh_pack_format(project: &mut crate::state::Project) {
    let pack_info = read_pack_info(project.source.as_ref());
    project.pack_format = pack_info.pack_format;
}

pub(crate) fn refresh_project_for_paths(
    app: &mut crate::state::AppState,
    db: &sled::Db,
    handle: ProjectHandle,
    changed_paths: &[String],
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let project = project_for_handle_mut(app, handle)?;
    let source_path = project.source_path.clone();
    let source_kind = project.source_kind;
    project.source = load_source(&source_path)?;
    refresh_pack_format(project);
    let old_fp = project.index.fingerprint.clone();
    let new_fp = source_fingerprint(&project.source_path)?;
    patch_entries_for_paths(
        &mut project.index.entries,
        project.source.as_ref(),
        changed_paths,
        None,
    )?;
    prune_orphan_entries(&mut project.index.entries, project.source.as_ref())?;
    project.index.fingerprint = new_fp.clone();
    let entries_snapshot = project.index.entries.clone();
    if let Ok(mut cache) = project.index.model_cache.lock() {
        cache.clear();
    }
    rebuild_texture_model_index(project)?;
    refresh_index_cache(db, &old_fp, &new_fp, &entries_snapshot)?;
    if crate::catalog::patch::paths_need_full_catalog_rebuild(changed_paths) {
        crate::catalog::build_project_catalog(project, db)?;
    } else {
        crate::catalog::patch_project_catalog(project, db, changed_paths)?;
    }
    Ok((source_kind, source_path))
}

pub(crate) fn full_resync_project_after_disk_change(
    app: &mut crate::state::AppState,
    db: &sled::Db,
    handle: ProjectHandle,
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let project = project_for_handle_mut(app, handle)?;
    let source_path = project.source_path.clone();
    let source_kind = project.source_kind;
    project.source = load_source(&source_path)?;
    refresh_pack_format(project);
    let old_fp = project.index.fingerprint.clone();
    let new_fp = source_fingerprint(&project.source_path)?;
    project.index.entries = scan_index_entries(project.source.as_ref())?;
    project.index.fingerprint = new_fp.clone();
    let entries_snapshot = project.index.entries.clone();
    if let Ok(mut cache) = project.index.model_cache.lock() {
        cache.clear();
    }
    rebuild_texture_model_index(project)?;
    refresh_index_cache(db, &old_fp, &new_fp, &entries_snapshot)?;
    log_if_err(
        crate::catalog::invalidate_project_catalog_cache(db, &new_fp),
        "invalidate catalog after full resync",
    );
    log_if_err(
        crate::catalog::icon_cache::invalidate_icon_cache_prefix(db, &new_fp),
        "invalidate icons after full resync",
    );
    crate::catalog::build_project_catalog(project, db)?;
    Ok((source_kind, source_path))
}
