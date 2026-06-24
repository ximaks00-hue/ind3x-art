pub mod folder;
pub mod jar;

use std::path::Path;
use std::path::PathBuf;
use std::fs;

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

pub fn validate_relative_asset_path(path: &str) -> CoreResult<String> {
    let normalized = normalize_zip_path(path);
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Internal("path cannot be empty".to_string()));
    }
    if trimmed.starts_with('/') || trimmed.starts_with("//") {
        return Err(CoreError::Internal(format!("absolute paths are not allowed: {path}")));
    }
    if trimmed.contains(':') {
        return Err(CoreError::Internal(format!("drive-prefixed paths are not allowed: {path}")));
    }
    let mut cleaned = Vec::new();
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(CoreError::Internal(format!(
                "path traversal is not allowed: {path}"
            )));
        }
        cleaned.push(segment);
    }
    if cleaned.is_empty() {
        return Err(CoreError::Internal("path cannot be empty".to_string()));
    }
    Ok(cleaned.join("/"))
}

pub fn safe_join_under_root(root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    let rel = validate_relative_asset_path(rel_path)?;
    let root_canonical = fs::canonicalize(root).map_err(|e| {
        CoreError::Internal(format!(
            "failed to canonicalize root {}: {e}",
            root.display()
        ))
    })?;
    let joined = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    let candidate = if joined.exists() {
        fs::canonicalize(&joined).map_err(|e| {
            CoreError::Internal(format!(
                "failed to canonicalize path {}: {e}",
                joined.display()
            ))
        })?
    } else {
        let mut existing_ancestor = joined.as_path();
        while !existing_ancestor.exists() {
            existing_ancestor = existing_ancestor.parent().ok_or_else(|| {
                CoreError::Internal(format!("invalid destination path: {}", joined.display()))
            })?;
        }
        let ancestor_canonical = fs::canonicalize(existing_ancestor).map_err(|e| {
            CoreError::Internal(format!(
                "failed to canonicalize destination ancestor {}: {e}",
                existing_ancestor.display()
            ))
        })?;
        let remainder = joined
            .strip_prefix(existing_ancestor)
            .map_err(|e| CoreError::Internal(format!("invalid destination remainder: {e}")))?;
        ancestor_canonical.join(remainder)
    };
    if !candidate.starts_with(&root_canonical) {
        return Err(CoreError::Internal(format!(
            "path escapes root {}: {}",
            root.display(),
            joined.display()
        )));
    }
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_path_rejects_traversal_and_absolute() {
        assert!(validate_relative_asset_path("../secret.txt").is_err());
        assert!(validate_relative_asset_path("/etc/passwd").is_err());
        assert!(validate_relative_asset_path("C:/windows/system32").is_err());
    }

    #[test]
    fn validate_path_normalizes_supported_relative_paths() {
        let normalized = validate_relative_asset_path("assets\\minecraft//textures/stone.png")
            .expect("normalized");
        assert_eq!(normalized, "assets/minecraft/textures/stone.png");
    }

    #[cfg(unix)]
    #[test]
    fn safe_join_rejects_symlink_escape() {
        use std::fs;
        use tempfile::TempDir;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let link = root.path().join("assets");
        std::os::unix::fs::symlink(outside.path(), &link).expect("symlink");

        let err = safe_join_under_root(root.path(), "assets/file.txt")
            .expect_err("must reject escape");
        assert!(format!("{err:?}").contains("escapes root"));
        let _ = fs::remove_file(link);
    }
}
