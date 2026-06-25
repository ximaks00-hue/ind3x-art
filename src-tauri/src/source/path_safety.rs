use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::error::{CoreError, CoreResult};

/// Canonical project root used for prefix checks.
pub fn canonical_root(root: &Path) -> CoreResult<PathBuf> {
    fs::canonicalize(root).map_err(|e| {
        CoreError::Internal(format!(
            "failed to canonicalize root {}: {e}",
            root.display()
        ))
    })
}

/// True when `candidate` is not equal to and not nested under `root_canonical`.
pub fn path_escapes_root(root_canonical: &Path, candidate: &Path) -> bool {
    let mut root_components = root_canonical.components();
    let mut candidate_components = candidate.components();
    loop {
        match (root_components.next(), candidate_components.next()) {
            (Some(Component::RootDir), Some(Component::RootDir)) => continue,
            (Some(Component::Prefix(a)), Some(Component::Prefix(b))) if a == b => continue,
            (Some(a), Some(b)) if a == b => continue,
            (None, None) => return false,
            (None, _) => return false,
            _ => return true,
        }
    }
}

#[cfg(windows)]
pub(crate) fn is_reparse_point_for_join(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    fs::symlink_metadata(path)
        .map(|meta| meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub(crate) fn is_reparse_point_for_join(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
}

fn reject_reparse_points_on_path(root_canonical: &Path, path: &Path) -> CoreResult<()> {
    for ancestor in path.ancestors() {
        if ancestor == root_canonical || !ancestor.exists() {
            continue;
        }
        if is_reparse_point_for_join(ancestor) {
            return Err(CoreError::InvalidInput(format!(
                "reparse point in destination path is not allowed: {}",
                ancestor.display()
            )));
        }
    }
    Ok(())
}

/// Re-canonicalize after directory creation and reject TOCTOU escapes / reparse points.
pub fn ensure_write_path_under_root(
    root_canonical: &Path,
    target: &Path,
) -> CoreResult<PathBuf> {
    let verified = if target.exists() {
        fs::canonicalize(target).map_err(|e| {
            CoreError::Internal(format!(
                "failed to canonicalize write target {}: {e}",
                target.display()
            ))
        })?
    } else {
        let parent = target.parent().ok_or_else(|| {
            CoreError::InvalidInput(format!("invalid write target: {}", target.display()))
        })?;
        let parent_canonical = fs::canonicalize(parent).map_err(|e| {
            CoreError::Internal(format!(
                "failed to canonicalize parent {}: {e}",
                parent.display()
            ))
        })?;
        let file_name = target.file_name().ok_or_else(|| {
            CoreError::InvalidInput(format!("invalid write target: {}", target.display()))
        })?;
        parent_canonical.join(file_name)
    };

    if path_escapes_root(root_canonical, &verified) {
        return Err(CoreError::InvalidInput(format!(
            "path escapes root {}: {}",
            root_canonical.display(),
            target.display()
        )));
    }

    reject_reparse_points_on_path(root_canonical, &verified)?;
    Ok(verified)
}

/// Resolve a relative asset path and verify the destination immediately before writing.
pub fn prepare_file_write_under_root(root: &Path, rel_path: &str) -> CoreResult<PathBuf> {
    let root_canonical = canonical_root(root)?;
    let target = super::safe_join_under_root(root, rel_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    ensure_write_path_under_root(&root_canonical, &target)
}

/// Reject path segments that Windows treats specially (reserved device names, trailing dots/spaces).
pub fn validate_path_segment(segment: &str, full_path: &str) -> CoreResult<()> {
    if segment.ends_with(' ') || segment.ends_with('.') {
        return Err(CoreError::InvalidInput(format!(
            "path segment must not end with a dot or space: {full_path}"
        )));
    }
    if segment.contains(|c: char| matches!(c, '\0'..='\x1f' | '"' | '*' | '?' | '<' | '>' | '|')) {
        return Err(CoreError::InvalidInput(format!(
            "path segment contains invalid characters: {full_path}"
        )));
    }
    if is_windows_reserved_device_name(segment) {
        return Err(CoreError::InvalidInput(format!(
            "path segment uses a reserved Windows device name: {full_path}"
        )));
    }
    Ok(())
}

fn is_windows_reserved_device_name(segment: &str) -> bool {
    let stem = segment
        .rsplit_once('.')
        .map(|(name, _)| name)
        .unwrap_or(segment);
    let stem = stem.trim_end_matches(&[' ', '.'][..]);
    if stem.is_empty() {
        return false;
    }
    let upper = stem.to_ascii_uppercase();
    if matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    if upper.len() == 4 {
        let prefix = &upper[..3];
        let suffix = upper.as_bytes()[3];
        if (prefix == "COM" || prefix == "LPT") && suffix.is_ascii_digit() {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod segment_tests {
    use super::*;

    #[test]
    fn rejects_reserved_device_stems() {
        for name in ["CON", "con.txt", "COM1", "LPT9"] {
            assert!(is_windows_reserved_device_name(name), "{name}");
        }
        assert!(!is_windows_reserved_device_name("stone"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn path_escapes_root_rejects_outside_prefix() {
        let root = Path::new("/project/root");
        let outside = Path::new("/project/other/file.txt");
        assert!(path_escapes_root(root, outside));
    }

    #[test]
    fn path_escapes_root_allows_nested_path() {
        let root = Path::new("/project/root");
        let nested = Path::new("/project/root/assets/file.txt");
        assert!(!path_escapes_root(root, nested));
    }

    #[cfg(windows)]
    #[test]
    fn is_reparse_point_detects_directory_junction() {
        use std::os::windows::fs::symlink_dir;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let link = root.path().join("junction");
        symlink_dir(outside.path(), &link).expect("junction");

        assert!(is_reparse_point_for_join(&link));
    }

    #[cfg(windows)]
    #[test]
    fn ensure_write_rejects_target_under_junction() {
        use std::os::windows::fs::symlink_dir;

        let root = TempDir::new().expect("temp root");
        let outside = TempDir::new().expect("outside");
        let nested = root.path().join("assets").join("nested");
        fs::create_dir_all(&nested).expect("nested");
        let junction = nested.join("escape");
        symlink_dir(outside.path(), &junction).expect("junction");

        let err = prepare_file_write_under_root(root.path(), "assets/nested/escape/file.txt")
            .expect_err("junction escape");
        let message = format!("{err:?}");
        assert!(
            message.contains("reparse point") || message.contains("escapes root"),
            "unexpected error: {message}"
        );
    }
}
