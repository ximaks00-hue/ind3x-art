use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use zip::read::ZipArchive;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, AssetSource};

pub struct JarSource {
    path: PathBuf,
    archive: Mutex<Option<(SystemTime, ZipArchive<File>)>>,
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
            archive: Mutex::new(None),
        })
    }

    pub fn invalidate_cache(&self) {
        if let Ok(mut guard) = self.archive.lock() {
            *guard = None;
        }
    }

    /// Count blockstate JSON paths without building the full entry list.
    pub fn count_blockstate_paths(&self) -> CoreResult<usize> {
        self.count_zip_paths(|name| name.contains("/blockstates/") && name.ends_with(".json"))
    }

    /// Count lang JSON paths under assets without building the full entry list.
    pub fn count_lang_paths(&self) -> CoreResult<usize> {
        self.count_zip_paths(|name| {
            name.starts_with("assets/")
                && name.contains("/lang/")
                && name.ends_with(".json")
        })
    }

    fn count_zip_paths(&self, predicate: impl Fn(&str) -> bool) -> CoreResult<usize> {
        self.with_archive(|archive| {
            let mut count = 0usize;
            for i in 0..archive.len() {
                let file = archive
                    .by_index(i)
                    .map_err(|e| CoreError::Internal(format!("zip entry read failed: {e}")))?;
                if file.is_dir() {
                    continue;
                }
                let name = normalize_zip_path(file.name());
                if predicate(&name) {
                    count += 1;
                }
            }
            Ok(count)
        })
    }

    fn with_archive<T, F>(&self, f: F) -> CoreResult<T>
    where
        F: FnOnce(&mut ZipArchive<File>) -> CoreResult<T>,
    {
        let meta = std::fs::metadata(&self.path)?;
        let modified = meta
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH);

        let mut guard = self
            .archive
            .lock()
            .map_err(|_| CoreError::Internal("jar archive lock poisoned".to_string()))?;

        let needs_reload = guard
            .as_ref()
            .map(|(ts, _)| *ts != modified)
            .unwrap_or(true);

        if needs_reload {
            let file = File::open(&self.path)?;
            let archive = ZipArchive::new(file)
                .map_err(|e| CoreError::Internal(format!("invalid zip/jar: {e}")))?;
            *guard = Some((modified, archive));
        }

        let (_, archive) = guard
            .as_mut()
            .ok_or_else(|| CoreError::Internal("jar archive unavailable".to_string()))?;
        f(archive)
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
            let mut file = archive
                .by_name(&needle)
                .map_err(|_| CoreError::AssetNotFound(needle))?;
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)?;
            Ok(buf)
        })
    }
}
