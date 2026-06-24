use std::path::Path;
use std::collections::HashSet;

use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::dto::{BackupInfo, SourceKind};
use crate::error::{CoreError, CoreResult};
use crate::source::safe_join_under_root;

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

pub fn restore_backup_from_known_path(
    source_path: &Path,
    kind: SourceKind,
    backup_path: &str,
) -> CoreResult<()> {
    let requested = std::path::Path::new(backup_path)
        .canonicalize()
        .map_err(|e| CoreError::Internal(format!("backup path is invalid: {e}")))?;
    let backups = list_backups(source_path, kind)?;
    let known = backups.into_iter().find(|info| {
        std::path::Path::new(&info.path)
            .canonicalize()
            .map(|candidate| candidate == requested)
            .unwrap_or(false)
    });
    let info = known
        .ok_or_else(|| CoreError::Internal("backup path is not recognized".to_string()))?;
    restore_backup(source_path, kind, Path::new(&info.path))
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

    let backup_root = root.join(".ind3x-backups");
    let mut backup_files: Vec<(std::path::PathBuf, std::path::PathBuf)> = Vec::new();
    let mut backup_rel_paths: HashSet<std::path::PathBuf> = HashSet::new();

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
        let rel_str = rel.to_string_lossy();
        let dest = safe_join_under_root(root, &rel_str)?;
        backup_rel_paths.insert(rel.to_path_buf());
        backup_files.push((entry.path().to_path_buf(), dest));
    }

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if path.starts_with(&backup_root) {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .map_err(|e| CoreError::Internal(e.to_string()))?;
        if !backup_rel_paths.contains(rel) {
            std::fs::remove_file(path)?;
        }
    }

    for (src, dest) in backup_files {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, &dest)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restore_from_known_path_rejects_unknown_path() {
        let root = std::env::temp_dir().join(format!("ind3x-backup-guard-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.txt"), b"1").unwrap();

        let backup = create_backup(&root, SourceKind::Folder).expect("backup created");
        assert!(std::path::Path::new(&backup.path).exists());

        let unknown = root.join("not-a-backup");
        std::fs::create_dir_all(&unknown).unwrap();
        let result =
            restore_backup_from_known_path(&root, SourceKind::Folder, &unknown.to_string_lossy());
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn restore_folder_backup_removes_files_outside_snapshot() {
        let root = std::env::temp_dir().join(format!("ind3x-backup-restore-prune-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("a.txt"), b"1").unwrap();

        let backup = create_backup(&root, SourceKind::Folder).expect("backup created");
        std::fs::write(root.join("b.txt"), b"2").unwrap();
        assert!(root.join("b.txt").exists());

        restore_backup_from_known_path(&root, SourceKind::Folder, &backup.path).expect("restore");
        assert!(root.join("a.txt").exists());
        assert!(!root.join("b.txt").exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
