use std::path::Path;

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::dto::{BackupInfo, SourceKind};
use crate::error::{CoreError, CoreResult};

fn backup_id(path: &str) -> String {
    let digest = Sha256::digest(path.as_bytes());
    hex::encode(&digest[..8])
}

pub fn list_backups(source_path: &Path, kind: SourceKind) -> CoreResult<Vec<BackupInfo>> {
    match kind {
        SourceKind::Jar => list_jar_backups(source_path),
        SourceKind::Folder => list_folder_backups(source_path),
    }
}

fn list_jar_backups(jar_path: &Path) -> CoreResult<Vec<BackupInfo>> {
    let parent = jar_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = jar_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("pack.jar");
    let prefix = format!("{file_name}.");

    let mut backups = Vec::new();
    for entry in std::fs::read_dir(parent)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(&prefix) || !name.ends_with(".bak") {
            continue;
        }
        let middle = name
            .strip_prefix(&prefix)
            .and_then(|s| s.strip_suffix(".bak"))
            .unwrap_or("");
        let created_at = middle.parse::<u64>().unwrap_or(0);
        let path_str = path.to_string_lossy().to_string();
        backups.push(BackupInfo {
            id: backup_id(&path_str),
            path: path_str,
            created_at,
            label: format!("JAR backup · {created_at}"),
            kind: "jar".to_string(),
        });
    }

    backups.sort_by_key(|b| std::cmp::Reverse(b.created_at));
    Ok(backups)
}

fn list_folder_backups(root: &Path) -> CoreResult<Vec<BackupInfo>> {
    let backup_root = root.join(".ind3x-backups");
    if !backup_root.is_dir() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in std::fs::read_dir(&backup_root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let created_at = name.parse::<u64>().unwrap_or(0);
        let path_str = entry.path().to_string_lossy().to_string();
        backups.push(BackupInfo {
            id: backup_id(&path_str),
            path: path_str,
            created_at,
            label: format!("Folder backup · {created_at}"),
            kind: "folder".to_string(),
        });
    }

    backups.sort_by_key(|b| std::cmp::Reverse(b.created_at));
    Ok(backups)
}

pub fn restore_backup(
    source_path: &Path,
    kind: SourceKind,
    backup_path: &Path,
) -> CoreResult<()> {
    match kind {
        SourceKind::Jar => restore_jar_backup(source_path, backup_path),
        SourceKind::Folder => restore_folder_backup(source_path, backup_path),
    }
}

fn restore_jar_backup(jar_path: &Path, backup_path: &Path) -> CoreResult<()> {
    if !backup_path.is_file() {
        return Err(CoreError::Internal(format!(
            "backup file not found: {}",
            backup_path.display()
        )));
    }
    std::fs::copy(backup_path, jar_path)?;
    Ok(())
}

fn restore_folder_backup(root: &Path, backup_session: &Path) -> CoreResult<()> {
    if !backup_session.is_dir() {
        return Err(CoreError::Internal(format!(
            "backup session not found: {}",
            backup_session.display()
        )));
    }

    for entry in WalkDir::new(backup_session)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(backup_session)
            .map_err(|e| CoreError::Internal(e.to_string()))?;
        let dest = root.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(entry.path(), &dest)?;
    }

    Ok(())
}

/// Restore backup by its stable `id` (SHA hex prefix of path).
pub fn restore_backup_by_id(
    source_path: &Path,
    kind: SourceKind,
    id: &str,
) -> CoreResult<()> {
    let backups = list_backups(source_path, kind)?;
    let info = backups
        .iter()
        .find(|b| b.id == id)
        .ok_or_else(|| CoreError::Internal(format!("backup id not found: {id}")))?;
    restore_backup(source_path, kind, Path::new(&info.path))
}


/// Creates a new manual backup snapshot and returns its `BackupInfo`.
pub fn create_backup(source_path: &Path, kind: SourceKind) -> CoreResult<BackupInfo> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    match kind {
        SourceKind::Jar => {
            let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
            let file_name = source_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("pack.jar");
            let backup_name = format!("{file_name}.{ts}.bak");
            let backup_path = parent.join(&backup_name);
            std::fs::copy(source_path, &backup_path)?;
            let path_str = backup_path.to_string_lossy().to_string();
            Ok(BackupInfo {
                id: backup_id(&path_str),
                path: path_str,
                created_at: ts,
                label: format!("JAR backup · {ts}"),
                kind: "jar".to_string(),
            })
        }
        SourceKind::Folder => {
            let backup_root = source_path.join(".ind3x-backups");
            let backup_dir = backup_root.join(ts.to_string());
            std::fs::create_dir_all(&backup_dir)?;
            // Copy all files that are not inside .ind3x-backups
            for entry in WalkDir::new(source_path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                // Skip the backup folder itself
                if path.starts_with(&backup_root) {
                    continue;
                }
                let rel = path.strip_prefix(source_path)
                    .map_err(|e| CoreError::Internal(e.to_string()))?;
                let dest = backup_dir.join(rel);
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::copy(path, &dest)?;
            }
            let path_str = backup_dir.to_string_lossy().to_string();
            Ok(BackupInfo {
                id: backup_id(&path_str),
                path: path_str,
                created_at: ts,
                label: format!("Folder backup · {ts}"),
                kind: "folder".to_string(),
            })
        }
    }
}
