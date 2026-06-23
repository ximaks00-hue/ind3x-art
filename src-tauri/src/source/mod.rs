pub mod folder;
pub mod jar;

use std::path::Path;

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};

pub use folder::FolderSource;
pub use jar::JarSource;

pub trait AssetSource: Send + Sync {
    fn source_path(&self) -> &Path;
    fn source_kind(&self) -> SourceKind;
    fn list_entries(&self) -> CoreResult<Vec<String>>;
    fn read(&self, path: &str) -> CoreResult<Vec<u8>>;
}

pub fn open_source(path: &Path) -> CoreResult<Box<dyn AssetSource>> {
    if path.is_dir() {
        return Ok(Box::new(FolderSource::new(path)?));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());

    if ext.as_deref() == Some("jar") || ext.as_deref() == Some("zip") {
        return Ok(Box::new(JarSource::new(path)?));
    }

    Err(CoreError::Internal(format!(
        "unsupported source type: {}",
        path.display()
    )))
}

pub fn normalize_zip_path(path: &str) -> String {
    path.replace('\\', "/")
}
