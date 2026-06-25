use std::collections::HashMap;
use std::fs;
use std::sync::Arc;

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
use crate::source::{prepare_file_write_under_root, validate_relative_asset_path};
use crate::state::{read_project, write_project, SharedState};

use super::helpers::{
    clone_project_for_off_lock_work, full_resync_project_on_project,
    invalidate_jar_cache_if_needed, project_for_handle, publish_project_work_result,
    refresh_project_for_paths_on_project,
};

async fn refresh_paths_off_lock(
    state: &SharedState,
    handle: ProjectHandle,
    changed_paths: Vec<String>,
    journal_entry: Option<SaveJournalEntry>,
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let (project_arc, db) = {
        let app = state.read()?;
        (project_for_handle(&app, handle.clone())?, app.db.clone())
    };
    let project_arc_for_task = Arc::clone(&project_arc);

    tauri::async_runtime::spawn_blocking(move || {
        let mut scratch = {
            let project = read_project(&project_arc_for_task)?;
            clone_project_for_off_lock_work(&project)?
        };
        refresh_project_for_paths_on_project(&mut scratch, &db, &changed_paths)?;
        if let Some(entry) = journal_entry {
            scratch.save.journal.push(entry);
        }
        let mut project = write_project(&project_arc_for_task)?;
        publish_project_work_result(&mut project, scratch);
        Ok::<_, CoreError>(())
    })
    .await
    .map_err(|e| CoreError::Internal(format!("refresh task failed: {e}")))??;

    let project = read_project(&project_arc)?;
    Ok((project.source_kind, project.source_path.clone()))
}

async fn full_resync_off_lock(
    state: &SharedState,
    handle: ProjectHandle,
) -> CoreResult<(crate::dto::SourceKind, std::path::PathBuf)> {
    let (project_arc, db) = {
        let app = state.read()?;
        (project_for_handle(&app, handle.clone())?, app.db.clone())
    };
    let project_arc_for_task = Arc::clone(&project_arc);

    tauri::async_runtime::spawn_blocking(move || {
        let mut scratch = {
            let project = read_project(&project_arc_for_task)?;
            clone_project_for_off_lock_work(&project)?
        };
        full_resync_project_on_project(&mut scratch, &db)?;
        let mut project = write_project(&project_arc_for_task)?;
        publish_project_work_result(&mut project, scratch);
        Ok::<_, CoreError>(())
    })
    .await
    .map_err(|e| CoreError::Internal(format!("resync task failed: {e}")))??;

    let project = read_project(&project_arc)?;
    Ok((project.source_kind, project.source_path.clone()))
}

#[tauri::command]
#[specta::specta]
pub async fn save_texture_mcmeta(
    handle: ProjectHandle,
    texture_path: String,
    mcmeta_json: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind, db) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
        (project.source_path.clone(), project.source_kind, app.db.clone())
    };

    let _parsed: serde_json::Value = serde_json::from_str(&mcmeta_json)
        .map_err(|e| CoreError::InvalidInput(format!("invalid mcmeta JSON: {e}")))?;

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
            let abs = prepare_file_write_under_root(&source_path, &mcmeta_path)?;
            fs::write(&abs, bytes)?;
        }
    }

    let changed_paths = vec![texture_path, mcmeta_path];
    let (updated_kind, updated_source_path) =
        refresh_paths_off_lock(state.inner(), handle, changed_paths, None).await?;
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    let _ = db;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn save_textures(
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
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
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
        let journal_entry = SaveJournalEntry {
            timestamp,
            mode: options.mode,
            original_paths: original_paths.clone(),
            saved_paths: saved_paths.clone(),
            backup_path: backup_path.clone(),
        };
        refresh_paths_off_lock(
            state.inner(),
            handle,
            saved_paths.clone(),
            Some(journal_entry),
        )
        .await?
    };
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    let _ = db;

    Ok(SaveTexturesResult {
        saved_count: saved_paths.len() as u64,
        saved_paths,
        original_paths,
        backup_path,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn save_batch(
    handle: ProjectHandle,
    textures: Vec<TextureSaveEntry>,
    options: Option<SaveOptions>,
    state: State<'_, SharedState>,
) -> CoreResult<SaveTexturesResult> {
    save_textures(handle, textures, options, state).await
}

#[tauri::command]
#[specta::specta]
pub fn get_save_journal(
    handle: ProjectHandle,
    state: State<'_, SharedState>,
) -> CoreResult<Vec<SaveJournalEntry>> {
    let app = state.read()?;
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;
    Ok(project.save.journal.clone())
}

#[tauri::command]
#[specta::specta]
pub async fn rollback_last_save(handle: ProjectHandle, state: State<'_, SharedState>) -> CoreResult<()> {
    let (entry, source_path, source_kind) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let mut project = write_project(&arc)?;
        let entry = project
            .save
            .journal
            .pop()
            .ok_or_else(|| CoreError::Internal("no save to roll back".to_string()))?;
        (entry, project.source_path.clone(), project.source_kind)
    };

    let backup = entry
        .backup_path
        .as_deref()
        .ok_or_else(|| CoreError::Internal("save journal entry has no backup".to_string()))?;

    restore_backup_from_known_path(&source_path, source_kind, backup)?;

    let (updated_kind, updated_source_path) = full_resync_off_lock(state.inner(), handle).await?;
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
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;

    list_backups(&project.source_path, project.source_kind)
}

#[tauri::command]
#[specta::specta]
pub async fn restore_project_backup(
    handle: ProjectHandle,
    backup_path: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
        (project.source_path.clone(), project.source_kind)
    };

    restore_backup_from_known_path(&source_path, source_kind, &backup_path)?;
    let (updated_kind, updated_source_path) = full_resync_off_lock(state.inner(), handle).await?;
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
    let arc = project_for_handle(&app, handle)?;
    let project = read_project(&arc)?;

    create_backup(&project.source_path, project.source_kind)
}

#[tauri::command]
#[specta::specta]
pub async fn restore_project_backup_by_id(
    handle: ProjectHandle,
    backup_id: String,
    state: State<'_, SharedState>,
) -> CoreResult<()> {
    let (source_path, source_kind) = {
        let app = state.read()?;
        let arc = project_for_handle(&app, handle.clone())?;
        let project = read_project(&arc)?;
        (project.source_path.clone(), project.source_kind)
    };

    restore_backup_by_id(&source_path, source_kind, &backup_id)?;
    let (updated_kind, updated_source_path) = full_resync_off_lock(state.inner(), handle).await?;
    invalidate_jar_cache_if_needed(updated_kind, &updated_source_path);
    Ok(())
}
