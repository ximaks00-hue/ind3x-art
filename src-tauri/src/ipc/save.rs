use std::collections::HashMap;

use tauri::State;

use crate::dto::{
    BackupInfo, ProjectHandle, SaveJournalEntry, SaveMode, SaveOptions, SaveTexturesResult,
    TextureSaveEntry,
};
use crate::error::{CoreError, CoreResult};
use crate::save::restore_backup_by_id;
use crate::save::{
    create_backup, list_backups, prepare_textures, restore_backup_from_known_path, save_prepared_textures,
};
use crate::source::{safe_join_under_root, validate_relative_asset_path};
use crate::state::SharedState;

use super::helpers::{
    full_resync_project_after_disk_change, invalidate_jar_cache_if_needed, project_for_handle,
    project_for_handle_mut, refresh_project_for_paths,
};

#[tauri::command]
#[specta::specta]
pub fn save_texture_mcmeta(
    handle: ProjectHandle,
    texture_path: String,
    mcmeta_json: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind, db) = {
        let app = state.read()?;
        let project = app.projects.get(&handle.id).ok_or(CoreError::ProjectNotFound)?;
        (project.source_path.clone(), project.source_kind, app.db.clone())
    };

    let _parsed: serde_json::Value = serde_json::from_str(&mcmeta_json)
        .map_err(|e| CoreError::Internal(format!("invalid mcmeta JSON: {e}")))?;

    let texture_path = validate_relative_asset_path(&texture_path)?;
    let mcmeta_path = format!("{texture_path}.mcmeta");
    let bytes = mcmeta_json.into_bytes();

    use crate::dto::SourceKind;
    match source_kind {
        SourceKind::Jar => {
            let mut replacements = HashMap::new();
            replacements.insert(mcmeta_path.clone(), bytes);
            crate::save::rebuild_jar_atomic(&source_path, &replacements)?;
        }
        SourceKind::Folder => {
            let abs = safe_join_under_root(&source_path, &mcmeta_path)?;
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&abs, bytes)?;
        }
    }

    let changed_paths = vec![texture_path, mcmeta_path];
    let (updated_kind, updated_source_path) = {
        let mut app = state.write()?;
        refresh_project_for_paths(&mut app, &db, handle, &changed_paths)?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    Ok(())
}

#[tauri::command]
#[specta::specta]
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

    let (source_path, source_kind, db) = {
        let app = state.read()?;
        let project = project_for_handle(&app, handle.clone())?;
        (project.source_path.clone(), project.source_kind, app.db.clone())
    };

    let prepared = prepare_textures(textures, &options)?;
    let (original_paths, saved_paths, backup_path) = save_prepared_textures(
        &source_path,
        source_kind,
        prepared,
        &options,
    )?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let (updated_kind, updated_source_path) = if options.mode == SaveMode::ExportFolder {
        (source_kind, source_path)
    } else {
        let mut app = state.write()?;
        let project = project_for_handle_mut(&mut app, handle.clone())?;
        project.save.journal.push(SaveJournalEntry {
            timestamp,
            mode: options.mode,
            original_paths: original_paths.clone(),
            saved_paths: saved_paths.clone(),
            backup_path: backup_path.clone(),
        });
        refresh_project_for_paths(&mut app, &db, handle, &saved_paths)?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);

    Ok(SaveTexturesResult {
        saved_count: saved_paths.len() as u64,
        saved_paths,
        original_paths,
        backup_path,
    })
}

#[tauri::command]
#[specta::specta]
pub fn save_batch(
    handle: ProjectHandle,
    textures: Vec<TextureSaveEntry>,
    options: Option<SaveOptions>,
    state: State<'_, SharedState>,
) -> CoreResult<SaveTexturesResult> {
    save_textures(handle, textures, options, state)
}

#[tauri::command]
#[specta::specta]
pub fn get_save_journal(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<SaveJournalEntry>> {
    let app = state.read()?;
    let project = app
        .projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;
    Ok(project.save.journal.clone())
}

#[tauri::command]
#[specta::specta]
pub fn rollback_last_save(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    let (entry, source_path, source_kind, db) = {
        let mut app = state.write()?;
        let db = app.db.clone();
        let project = app.projects.get_mut(&handle.id).ok_or(CoreError::ProjectNotFound)?;
        let entry = project
            .save
            .journal
            .pop()
            .ok_or_else(|| CoreError::Internal("no save to roll back".to_string()))?;
        (entry, project.source_path.clone(), project.source_kind, db)
    };

    let backup = entry
        .backup_path
        .as_deref()
        .ok_or_else(|| CoreError::Internal("save journal entry has no backup".to_string()))?;

    restore_backup_from_known_path(&source_path, source_kind, backup)?;

    let (updated_kind, updated_source_path) = {
        let mut app = state.write()?;
        full_resync_project_after_disk_change(&mut app, &db, handle)?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn list_project_backups(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<BackupInfo>> {
    let app = state.read()?;
    let project = app
        .projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;

    list_backups(&project.source_path, project.source_kind)
}

#[tauri::command]
#[specta::specta]
pub fn restore_project_backup(
    handle: ProjectHandle,
    backup_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind, db) = {
        let app = state.read()?;
        let project = app
            .projects
            .get(&handle.id)
            .ok_or(CoreError::ProjectNotFound)?;
        (project.source_path.clone(), project.source_kind, app.db.clone())
    };

    restore_backup_from_known_path(&source_path, source_kind, &backup_path)?;
    let (updated_kind, updated_source_path) = {
        let mut app = state.write()?;
        full_resync_project_after_disk_change(&mut app, &db, handle)?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn create_project_backup(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<crate::dto::BackupInfo> {
    let app = state.read()?;
    let project = app
        .projects
        .get(&handle.id)
        .ok_or(CoreError::ProjectNotFound)?;

    create_backup(&project.source_path, project.source_kind)
}

#[tauri::command]
#[specta::specta]
pub fn restore_project_backup_by_id(
    handle: ProjectHandle,
    backup_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind, db) = {
        let app = state.read()?;
        let project = app
            .projects
            .get(&handle.id)
            .ok_or(CoreError::ProjectNotFound)?;
        (project.source_path.clone(), project.source_kind, app.db.clone())
    };

    restore_backup_by_id(&source_path, source_kind, &backup_id)?;
    let (updated_kind, updated_source_path) = {
        let mut app = state.write()?;
        full_resync_project_after_disk_change(&mut app, &db, handle)?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    Ok(())
}
