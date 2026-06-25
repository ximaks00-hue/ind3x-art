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

/// Read one zip entry without holding the shared archive mutex (parallel-safe).
pub fn read_zip_entry(jar_path: &Path, entry_path: &str) -> CoreResult<Vec<u8>> {
    let needle = normalize_zip_path(entry_path);
    let file = File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| CoreError::Internal(format!("invalid zip/jar: {e}")))?;
    let mut entry = archive
        .by_name(&needle)
        .map_err(|_| CoreError::AssetNotFound(needle))?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf)?;
    Ok(buf)
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
        match self.archive.lock() {
            Ok(mut guard) => *guard = None,
            Err(poisoned) => {
                tracing::warn!("recovering poisoned jar archive mutex");
                *poisoned.into_inner() = None;
            }
        }
    }

    /// Count blockstate JSON paths without building the full entry list.
    pub fn count_blockstate_paths(&self) -> CoreResult<usize> {
        Ok(self.count_blockstate_and_lang_paths()?.0)
    }

    /// Count lang JSON paths under assets without building the full entry list.
    pub fn count_lang_paths(&self) -> CoreResult<usize> {
        Ok(self.count_blockstate_and_lang_paths()?.1)
    }

    /// Single zip traversal for cache-trust metrics.
    pub fn count_blockstate_and_lang_paths(&self) -> CoreResult<(usize, usize)> {
        self.with_archive(|archive| {
            let mut blockstates = 0usize;
            let mut langs = 0usize;
            for i in 0..archive.len() {
                let file = archive
                    .by_index(i)
                    .map_err(|e| CoreError::Internal(format!("zip entry read failed: {e}")))?;
                if file.is_dir() {
                    continue;
                }
                let name = normalize_zip_path(file.name());
                if name.contains("/blockstates/") && name.ends_with(".json") {
                    blockstates += 1;
                }
                if name.starts_with("assets/")
                    && name.contains("/lang/")
                    && name.ends_with(".json")
                {
                    langs += 1;
                }
            }
            Ok((blockstates, langs))
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

        let mut guard = match self.archive.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                tracing::warn!("recovering poisoned jar archive mutex");
                poisoned.into_inner()
            }
        };

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
        read_zip_entry(&self.path, path)
    }
}
