use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, safe_join_under_root, AssetSource};

fn is_internal_pack_path(rel: &str) -> bool {
    rel.split('/')
        .next()
        .is_some_and(|segment| segment.starts_with(".ind3x-"))
}

pub struct FolderSource {
    root: PathBuf,
}

impl FolderSource {
    pub fn new(path: &Path) -> CoreResult<Self> {
        if !path.is_dir() {
            return Err(CoreError::Internal(format!(
                "folder source not found: {}",
                path.display()
            )));
        }
        Ok(Self {
            root: path.to_path_buf(),
        })
    }
}

impl AssetSource for FolderSource {
    fn source_path(&self) -> &Path {
        &self.root
    }

    fn source_kind(&self) -> SourceKind {
        SourceKind::Folder
    }

    fn list_entries(&self) -> CoreResult<Vec<String>> {
        let mut paths = Vec::new();
        for entry in WalkDir::new(&self.root).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() {
                continue;
            }
            let rel = entry
                .path()
                .strip_prefix(&self.root)
                .map_err(|e| CoreError::Internal(e.to_string()))?;
            let rel = normalize_zip_path(&rel.to_string_lossy());
            if is_internal_pack_path(&rel) {
                continue;
            }
            paths.push(rel);
        }
        Ok(paths)
    }

    fn read(&self, path: &str) -> CoreResult<Vec<u8>> {
        let full = safe_join_under_root(&self.root, path)?;
        fs::read(full).map_err(CoreError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn list_entries_skips_internal_backup_paths() {
        let root = TempDir::new().expect("temp");
        fs::create_dir_all(root.path().join("assets/minecraft/textures/block")).unwrap();
        fs::write(
            root.path().join("assets/minecraft/textures/block/stone.png"),
            b"png",
        )
        .unwrap();
        fs::create_dir_all(root.path().join(".ind3x-backups/1/assets/minecraft/textures/block"))
            .unwrap();
        fs::write(
            root.path()
                .join(".ind3x-backups/1/assets/minecraft/textures/block/stone.png"),
            b"backup",
        )
        .unwrap();

        let source = FolderSource::new(root.path()).expect("source");
        let paths = source.list_entries().expect("list");
        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with("stone.png"));
        assert!(!paths.iter().any(|p| p.contains(".ind3x-")));
    }
}
