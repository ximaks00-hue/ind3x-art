use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use zip::read::ZipArchive;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, AssetSource};

/// Max decompressed bytes per zip entry (zip-bomb guard for models, lang, blockstates, etc.).
pub const MAX_ZIP_ENTRY_DECOMPRESSED_BYTES: usize = 32 * 1024 * 1024;

pub struct JarSource {
    path: PathBuf,
    archive: Mutex<Option<(SystemTime, ZipArchive<File>)>>,
}

/// Read one zip entry with a decompressed-size cap.
pub fn read_zip_entry_limited<R: Read>(entry: &mut R) -> CoreResult<Vec<u8>> {
    let limit = MAX_ZIP_ENTRY_DECOMPRESSED_BYTES as u64;
    let mut limited = entry.take(limit.saturating_add(1));
    let mut buf = Vec::new();
    limited.read_to_end(&mut buf).map_err(CoreError::from)?;
    if buf.len() > MAX_ZIP_ENTRY_DECOMPRESSED_BYTES {
        return Err(CoreError::InvalidInput(format!(
            "zip entry exceeds max decompressed size of {MAX_ZIP_ENTRY_DECOMPRESSED_BYTES} bytes"
        )));
    }
    Ok(buf)
}

/// Read one zip entry without holding the shared archive mutex (parallel-safe).
#[allow(dead_code)]
pub fn read_zip_entry(jar_path: &Path, entry_path: &str) -> CoreResult<Vec<u8>> {
    let needle = normalize_zip_path(entry_path);
    let file = File::open(jar_path)?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| CoreError::Internal(format!("invalid zip/jar: {e}")))?;
    let mut entry = archive
        .by_name(&needle)
        .map_err(|_| CoreError::AssetNotFound(needle))?;
    read_zip_entry_limited(&mut entry)
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
    #[allow(dead_code)]
    pub fn count_blockstate_paths(&self) -> CoreResult<usize> {
        Ok(self.count_blockstate_and_lang_paths()?.0)
    }

    /// Count lang JSON paths under assets without building the full entry list.
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
        let needle = normalize_zip_path(path);
        self.with_archive(|archive| {
            let mut entry = archive
                .by_name(&needle)
                .map_err(|_| CoreError::AssetNotFound(needle.clone()))?;
            read_zip_entry_limited(&mut entry)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    #[test]
    fn read_zip_entry_rejects_oversized_decompressed_payload() {
        let dir = std::env::temp_dir().join(format!("ind3x-zip-bomb-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let jar_path = dir.join("bomb.jar");

        let file = File::create(&jar_path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        writer.start_file("assets/minecraft/lang/en_us.json", options).unwrap();
        let oversized = vec![b'x'; MAX_ZIP_ENTRY_DECOMPRESSED_BYTES + 1];
        writer.write_all(&oversized).unwrap();
        writer.finish().unwrap();

        let err = read_zip_entry(&jar_path, "assets/minecraft/lang/en_us.json")
            .expect_err("oversized entry");
        assert!(matches!(err, CoreError::InvalidInput(_)));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
