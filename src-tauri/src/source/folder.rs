use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, AssetSource};

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
            paths.push(rel);
        }
        Ok(paths)
    }

    fn read(&self, path: &str) -> CoreResult<Vec<u8>> {
        let rel = normalize_zip_path(path);
        let full = self.root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        fs::read(full).map_err(CoreError::from)
    }
}
