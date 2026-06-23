use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use zip::read::ZipArchive;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, AssetSource};

pub struct JarSource {
    path: PathBuf,
}

impl JarSource {
    pub fn new(path: &Path) -> CoreResult<Self> {
        if !path.is_file() {
            return Err(CoreError::Internal(format!(
                "jar source not found: {}",
                path.display()
            )));
        }
        Ok(Self {
            path: path.to_path_buf(),
        })
    }

    fn with_archive<T, F>(&self, f: F) -> CoreResult<T>
    where
        F: FnOnce(&mut ZipArchive<File>) -> CoreResult<T>,
    {
        let file = File::open(&self.path)?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| CoreError::Internal(format!("invalid zip/jar: {e}")))?;
        f(&mut archive)
    }
}

impl AssetSource for JarSource {
    fn source_path(&self) -> &Path {
        &self.path
    }

    fn source_kind(&self) -> SourceKind {
        SourceKind::Jar
    }

    fn list_entries(&self) -> CoreResult<Vec<String>> {
        self.with_archive(|archive| {
            let mut paths = Vec::with_capacity(archive.len());
            for i in 0..archive.len() {
                let file = archive
                    .by_index(i)
                    .map_err(|e| CoreError::Internal(format!("zip entry read failed: {e}")))?;
                if file.is_dir() {
                    continue;
                }
                let name = normalize_zip_path(file.name());
                if !name.is_empty() {
                    paths.push(name);
                }
            }
            Ok(paths)
        })
    }

    fn read(&self, path: &str) -> CoreResult<Vec<u8>> {
        let needle = normalize_zip_path(path);
        self.with_archive(|archive| {
            let mut file = archive.by_name(&needle).map_err(|_| {
                CoreError::Internal(format!("zip entry not found: {needle}"))
            })?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            Ok(buf)
        })
    }
}
