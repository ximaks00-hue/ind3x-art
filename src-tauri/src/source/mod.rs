pub mod folder;
pub mod jar;
mod path_safety;

use std::fs;
use std::path::{Path, PathBuf};

use crate::dto::SourceKind;
use crate::error::{CoreError, CoreResult};

pub use folder::FolderSource;
pub use jar::JarSource;
pub use path_safety::{canonical_root, ensure_write_path_under_root, prepare_file_write_under_root};

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
        return Err(CoreError::InvalidInput("path cannot be empty".to_string()));
    }
    if trimmed.starts_with('/') || trimmed.starts_with("//") {
        return Err(CoreError::InvalidInput(format!(
            "absolute paths are not allowed: {path}"
        )));
    }
    if trimmed.contains(':') {
        return Err(CoreError::InvalidInput(format!(
            "drive-prefixed paths are not allowed: {path}"
        )));
    }
    let mut cleaned = Vec::new();
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err(CoreError::InvalidInput(format!(
                "path traversal is not allowed: {path}"
            )));
        }
        cleaned.push(segment);
    }
    if cleaned.is_empty() {
        return Err(CoreError::InvalidInput("path cannot be empty".to_string()));
    }
    Ok(cleaned.join("/"))
}

pub fn safe_join_under_root(root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    let rel = validate_relative_asset_path(rel_path)?;
    let root_canonical = canonical_root(root)?;
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
                CoreError::InvalidInput(format!("invalid destination path: {}", joined.display()))
            })?;
        }
        if path_safety::is_reparse_point_for_join(existing_ancestor) {
            return Err(CoreError::InvalidInput(format!(
                "reparse point in destination path is not allowed: {}",
                existing_ancestor.display()
            )));
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
    if path_safety::path_escapes_root(&root_canonical, &candidate) {
        return Err(CoreError::InvalidInput(format!(
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
        assert!(matches!(
            validate_relative_asset_path("../secret.txt"),
            Err(CoreError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_relative_asset_path("/etc/passwd"),
            Err(CoreError::InvalidInput(_))
        ));
        assert!(matches!(
            validate_relative_asset_path("C:/windows/system32"),
            Err(CoreError::InvalidInput(_))
        ));
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

        let err = safe_join_under_root(root.path(), "assets/file.txt").expect_err("must reject");
        let message = format!("{err:?}");
        assert!(
            message.contains("reparse point") || message.contains("escapes root"),
            "unexpected error: {message}"
        );
        let _ = fs::remove_file(link);
    }

    #[cfg(windows)]
    #[test]
    fn safe_join_rejects_directory_link_escape() {
        use std::fs;
        use std::os::windows::fs::symlink_dir;
        use tempfile::TempDir;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let link = root.path().join("assets");
        fs::create_dir_all(root.path().join("pack")).expect("pack dir");
        symlink_dir(outside.path(), &link).expect("dir symlink");

        let err = safe_join_under_root(root.path(), "assets/file.txt").expect_err("must reject");
        assert!(
            format!("{err:?}").contains("escapes root")
                || format!("{err:?}").contains("reparse point"),
            "unexpected error: {err:?}"
        );
    }

    #[cfg(windows)]
    #[test]
    fn prepare_write_rejects_junction_after_parent_creation() {
        use std::fs;
        use std::os::windows::fs::symlink_dir;
        use tempfile::TempDir;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let nested = root.path().join("assets").join("nested");
        fs::create_dir_all(&nested).expect("nested");
        let link = nested.join("escape");
        symlink_dir(outside.path(), &link).expect("junction");

        let err = prepare_file_write_under_root(root.path(), "assets/nested/escape/file.txt")
            .expect_err("must reject escape via reparse point");
        assert!(format!("{err:?}").contains("reparse point"));
    }
}
