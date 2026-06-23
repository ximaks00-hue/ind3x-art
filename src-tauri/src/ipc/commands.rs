use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::compile::{compile_multipart_renderable, compile_renderable, list_variant_keys};
use crate::dto::{
    AppInfo, AssetFacets, AssetFilter, AssetPage, AssetKind, BackupInfo, IndexEvent, ModelRefInfo,
    OpenSourceResult, PageReq, ProjectHandle, RenderableModel, SaveJournalEntry, SaveMode,
    SaveOptions, SaveTexturesResult, TexturePreview, TextureSaveEntry, VariantKey,
};
use crate::error::{CoreError, CoreResult};
use crate::image::{decode_texture_preview, encode_texture_full};
use crate::index::{run_index, source_fingerprint};
use crate::save::restore_backup_by_id;
use crate::model::multipart::{parse_variant_state, resolve_multipart_models};
use crate::model::normalize::{read_pack_info, PackInfo};
use crate::model::types::{
    blockstate_id_from_asset_path, model_id_from_asset_path, normalize_model_ref,
    texture_stem_from_entry_path,
};
use crate::resolve::{collect_variant_models, find_models_for_texture, ModelRegistry};
use crate::save::{create_backup, list_backups, prepare_textures, restore_backup, save_prepared_textures};
use crate::source::open_source as load_source;
use crate::state::SharedState;

fn pack_for_project(project: &crate::state::Project) -> PackInfo {
    PackInfo {
        pack_format: project.pack_format,
    }
}

#[tauri::command]
pub fn get_app_info(state: State<'_, SharedState>) -> AppInfo {
    state.lock().expect("state poisoned").app_info()
}

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
pub async fn open_source(
    path: String,
    on_event: tauri::ipc::Channel<IndexEvent>,
    state: State<'_, SharedState>,
    app_handle: tauri::AppHandle,
) -> CoreResult<OpenSourceResult> {
    let source_path = std::path::PathBuf::from(&path);
    let source = load_source(&source_path)?;
    let source_kind = source.source_kind();
    let fingerprint = source_fingerprint(source.source_path())?;

    let (handle_id, cancel, db) = {
        let mut app = state.lock().expect("state poisoned");
        let handle = app.alloc_handle();
        let cancel = app.register_cancel(handle.id);
        let db = app.db.clone();
        (handle.id, cancel, db)
    };

    let (entries, from_cache) =
        run_index(source.as_ref(), &db, &fingerprint, &cancel, &on_event)?;

    let pack_info = read_pack_info(source.as_ref());

    let (result, watcher_shared) = {
        let mut app = state.lock().expect("state poisoned");
        app.clear_cancel(handle_id);
        app.projects.insert(
            handle_id,
            crate::state::Project {
                source_path: source_path.clone(),
                source_kind,
                fingerprint,
                pack_format: pack_info.pack_format,
                entries: entries.clone(),
                source,
                model_cache: Mutex::new(HashMap::new()),
                save_journal: Vec::new(),
            },
        );
        let res = OpenSourceResult {
            handle: ProjectHandle { id: handle_id },
            source_path: path,
            source_kind,
            entry_count: entries.len() as u64,
            from_cache,
            pack_format: pack_info.pack_format,
        };
        (res, std::sync::Arc::clone(&app.watcher))
    };

    // Install file-system watcher for external change detection
    crate::watcher::install_watcher(app_handle, source_path, &watcher_shared);

    Ok(result)
}

#[tauri::command]
pub fn close_source(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    let mut app = state.lock().expect("state poisoned");
    app.cancel_index(handle.id);
    app.projects.remove(&handle.id);
    app.clear_cancel(handle.id);
    crate::watcher::stop_watcher(&std::sync::Arc::clone(&app.watcher));
    Ok(())
}

#[tauri::command]
pub fn cancel_index(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    state
        .lock()
        .expect("state poisoned")
        .cancel_index(handle.id);
    Ok(())
}

#[tauri::command]
pub fn query_assets(
    handle: ProjectHandle,
    filter: AssetFilter,
    page: PageReq,
    state: State<'_, SharedState>,
) -> CoreResult<AssetPage> {
    state
        .lock()
        .expect("state poisoned")
        .query_assets(handle.id, filter, page)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))
}

#[tauri::command]
pub fn get_asset_facets(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<AssetFacets> {
    state
        .lock()
        .expect("state poisoned")
        .asset_facets(handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))
}

#[tauri::command]
pub fn get_texture_preview(
    handle: ProjectHandle,
    asset_path: String,
    max_size: Option<u32>,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let entry = project
        .entries
        .iter()
        .find(|e| e.path == asset_path)
        .ok_or_else(|| CoreError::Internal("asset not found".to_string()))?;

    if entry.kind != AssetKind::Texture {
        return Err(CoreError::Internal("not a texture asset".to_string()));
    }

    let bytes = project.source.read(&asset_path)?;
    decode_texture_preview(&bytes, max_size.unwrap_or(32))
}

#[tauri::command]
pub fn get_texture(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<TexturePreview> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let bytes = project.source.read(&texture_path)?;
    encode_texture_full(&bytes)
}

/// Returns raw PNG bytes via Tauri binary IPC (avoids base64 overhead).
#[tauri::command]
pub fn get_texture_binary(
    handle: ProjectHandle,
    texture_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<tauri::ipc::Response> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let bytes = project.source.read(&texture_path)?;
    // Validate it's actually a PNG before sending
    if !bytes.starts_with(b"\x89PNG") {
        return Err(CoreError::Internal("not a valid PNG".to_string()));
    }
    Ok(tauri::ipc::Response::new(bytes))
}

/// Save or update a `.mcmeta` animation descriptor alongside a texture.
#[tauri::command]
pub fn save_texture_mcmeta(
    handle: ProjectHandle,
    texture_path: String,
    mcmeta_json: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    // Validate JSON
    let _parsed: serde_json::Value = serde_json::from_str(&mcmeta_json)
        .map_err(|e| CoreError::Internal(format!("invalid mcmeta JSON: {e}")))?;

    let mcmeta_path = format!("{}.mcmeta", texture_path);
    let bytes = mcmeta_json.into_bytes();

    use crate::dto::SourceKind;
    match project.source_kind {
        SourceKind::Jar => {
            let mut replacements = HashMap::new();
            replacements.insert(mcmeta_path, bytes);
            crate::save::rebuild_jar_atomic(&project.source_path, &replacements)
        }
        SourceKind::Folder => {
            let abs = project.source_path.join(mcmeta_path);
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&abs, bytes)?;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn save_textures(
    handle: ProjectHandle,
    textures: Vec<TextureSaveEntry>,
    options: Option<SaveOptions>,
    state: State<'_, SharedState>,
) -> CoreResult<SaveTexturesResult> {
    let options = options.unwrap_or(SaveOptions {
        mode: SaveMode::Overwrite,
        target_path: None,
        namespace: None,
    });

    let mut app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get_mut(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let prepared = prepare_textures(textures, &options)?;
    let (original_paths, saved_paths, backup_path) = save_prepared_textures(
        &project.source_path,
        project.source_kind,
        prepared,
        &options,
    )?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    project.save_journal.push(SaveJournalEntry {
        timestamp,
        mode: options.mode,
        original_paths: original_paths.clone(),
        saved_paths: saved_paths.clone(),
        backup_path: backup_path.clone(),
    });

    Ok(SaveTexturesResult {
        saved_count: saved_paths.len() as u64,
        saved_paths,
        original_paths,
        backup_path,
    })
}

/// Batch-save every dirty texture in one call. Each entry carries its own SaveOptions.
/// This lets the UI flush all dirty textures to the same source in a single lock.
#[tauri::command]
pub fn save_batch(
    handle: ProjectHandle,
    textures: Vec<TextureSaveEntry>,
    options: Option<SaveOptions>,
    state: State<'_, SharedState>,
) -> CoreResult<SaveTexturesResult> {
    // Reuse save_textures logic — batch IS save_textures with multiple entries.
    save_textures(handle, textures, options, state)
}

#[tauri::command]
pub fn get_save_journal(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<SaveJournalEntry>> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;
    Ok(project.save_journal.clone())
}

#[tauri::command]
pub fn list_project_backups(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<BackupInfo>> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    list_backups(&project.source_path, project.source_kind)
}

#[tauri::command]
pub fn restore_project_backup(
    handle: ProjectHandle,
    backup_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    restore_backup(
        &project.source_path,
        project.source_kind,
        std::path::Path::new(&backup_path),
    )
}

#[tauri::command]
pub fn create_project_backup(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::BackupInfo> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    create_backup(&project.source_path, project.source_kind)
}

#[tauri::command]
pub fn restore_project_backup_by_id(
    handle: ProjectHandle,
    backup_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    restore_backup_by_id(&project.source_path, project.source_kind, &backup_id)
}

#[tauri::command]
pub fn list_variants(
    handle: ProjectHandle,
    asset_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<VariantKey>> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let (namespace, block_name) = blockstate_id_from_asset_path(&asset_path)
        .ok_or_else(|| CoreError::Internal("not a blockstate path".to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = project.model_cache.lock().expect("cache poisoned");
    let registry = ModelRegistry::new(source, &mut cache, pack);
    let blockstate = registry.load_blockstate(&namespace, &block_name)?;
    Ok(list_variant_keys(&blockstate))
}

#[tauri::command]
pub fn models_for_texture(
    handle: ProjectHandle,
    asset_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<ModelRefInfo>> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let texture_stem = texture_stem_from_entry_path(&asset_path);
    let namespace = asset_path
        .strip_prefix("assets/")
        .and_then(|p| p.split('/').next())
        .unwrap_or("minecraft")
        .to_string();

    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = project.model_cache.lock().expect("cache poisoned");
    let mut registry = ModelRegistry::new(source, &mut cache, pack);
    find_models_for_texture(
        &mut registry,
        &project.entries,
        &texture_stem,
        &namespace,
    )
}

#[tauri::command]
pub fn resolve_renderable(
    handle: ProjectHandle,
    asset_path: String,
    variant_key: Option<String>,
    state: State<'_, SharedState>,
) -> CoreResult<RenderableModel> {
    let app = state.lock().expect("state poisoned");
    let project = app
        .projects
        .get(&handle.id)
        .ok_or_else(|| CoreError::Internal("project not found".to_string()))?;

    let entry = project
        .entries
        .iter()
        .find(|e| e.path == asset_path)
        .ok_or_else(|| CoreError::Internal("asset not found".to_string()))?;

    let source = project.source.as_ref();
    let pack = pack_for_project(project);
    let mut cache = project.model_cache.lock().expect("cache poisoned");
    let mut registry = ModelRegistry::new(source, &mut cache, pack);

    match entry.kind {
        AssetKind::Texture => {
            let texture_stem = texture_stem_from_entry_path(&asset_path);
            let models = find_models_for_texture(
                &mut registry,
                &project.entries,
                &texture_stem,
                &entry.namespace,
            )?;
            let first = models.first().ok_or_else(|| {
                CoreError::Internal("no models reference this texture".to_string())
            })?;
            let (ns, path) = if let Some((a, b)) = first.model_id.split_once(':') {
                (a.to_string(), b.to_string())
            } else {
                (entry.namespace.clone(), first.model_id.clone())
            };
            let resolved = registry.resolve_model(&ns, &path)?;
            compile_renderable(&resolved, &ns, None, &pack, &registry)
        }
        AssetKind::BlockModel | AssetKind::ItemModel => {
            let (ns, model_path) = model_id_from_asset_path(&asset_path)
                .ok_or_else(|| CoreError::Internal("invalid model path".to_string()))?;
            let resolved = registry.resolve_model(&ns, &model_path)?;
            compile_renderable(&resolved, &ns, None, &pack, &registry)
        }
        AssetKind::Blockstate => {
            let (ns, block_name) = blockstate_id_from_asset_path(&asset_path)
                .ok_or_else(|| CoreError::Internal("invalid blockstate path".to_string()))?;
            let blockstate = registry.load_blockstate(&ns, &block_name)?;

            if blockstate.multipart.is_some() && blockstate.variants.is_empty() {
                let state = variant_key
                    .as_ref()
                    .map(|key| parse_variant_state(key))
                    .unwrap_or_default();
                let variants = resolve_multipart_models(&blockstate, &state);
                if variants.is_empty() {
                    return Err(CoreError::Internal(
                        "no multipart models matched".to_string(),
                    ));
                }
                return compile_multipart_renderable(&mut registry, &ns, &variants, &pack);
            }

            let variants = collect_variant_models(&blockstate);
            let (variant, _) = variants
                .into_iter()
                .find(|(_, key)| variant_key.as_ref().is_none_or(|vk| vk == key))
                .ok_or_else(|| CoreError::Internal("no variants in blockstate".to_string()))?;
            let (m_ns, m_path) = normalize_model_ref(&variant.model, &ns);
            let resolved = registry.resolve_model(&m_ns, &m_path)?;
            compile_renderable(&resolved, &m_ns, Some(&variant), &pack, &registry)
        }
        _ => Err(CoreError::Internal(
            "asset kind cannot be rendered".to_string(),
        )),
    }
}

#[tauri::command]
pub fn reveal_log_dir(app: tauri::AppHandle) -> CoreResult<()> {
    let dir = crate::logging::log_directory()
        .or_else(|| app.path().app_log_dir().ok())
        .ok_or_else(|| CoreError::Internal("log directory unavailable".to_string()))?;

    std::fs::create_dir_all(&dir)?;

    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    Ok(())
}

/// Demonstrates ordered streaming over a Tauri Channel (legacy demo from Phase 0).
#[tauri::command]
pub async fn stream_demo(on_event: tauri::ipc::Channel<IndexEvent>) -> CoreResult<()> {
    use std::time::Instant;

    let started = Instant::now();
    let total = 8u64;

    on_event
        .send(IndexEvent::Started { total })
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    for scanned in 1..=total {
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        on_event
            .send(IndexEvent::Progress {
                scanned,
                total,
                stage: format!("demo stage {scanned}/{total}"),
            })
            .map_err(|e| CoreError::Internal(e.to_string()))?;
    }

    on_event
        .send(IndexEvent::Done {
            duration_ms: started.elapsed().as_millis() as u64,
            from_cache: false,
        })
        .map_err(|e| CoreError::Internal(e.to_string()))?;

    Ok(())
}
