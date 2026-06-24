use crate::dto::{SaveMode, SaveOptions};
use crate::error::{CoreError, CoreResult};
use crate::source::validate_relative_asset_path;

pub fn resolve_output_path(
    original_path: &str,
    entry_target: Option<&str>,
    options: &SaveOptions,
) -> CoreResult<String> {
    let path = validate_relative_asset_path(original_path)?;
    match options.mode {
        SaveMode::Overwrite | SaveMode::ExportFolder => Ok(path),
        SaveMode::Rename => {
            if let Some(target) = entry_target {
                return validate_relative_asset_path(target);
            }
            if let Some(target) = options.target_path.as_deref() {
                return validate_relative_asset_path(target);
            }
            Err(CoreError::Internal(
                "rename save requires target_path on entry or options".to_string(),
            ))
        }
        SaveMode::Namespace => {
            let ns = options.namespace.as_ref().ok_or_else(|| {
                CoreError::Internal("namespace save requires namespace option".to_string())
            })?;
            apply_namespace(&path, ns)
        }
    }
}

pub fn apply_namespace(path: &str, new_ns: &str) -> CoreResult<String> {
    if extract_namespace(path).is_none() {
        return Err(CoreError::Internal(format!(
            "cannot apply namespace to path: {path}"
        )));
    }
    let path = validate_relative_asset_path(path)?;
    let new_ns = new_ns.trim().trim_matches('/');
    if new_ns.is_empty() {
        return Err(CoreError::Internal("namespace cannot be empty".to_string()));
    }
    if !new_ns
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.')
    {
        return Err(CoreError::Internal(format!(
            "namespace contains unsupported characters: {new_ns}"
        )));
    }
    if let Some(rest) = path.strip_prefix("assets/") {
        if let Some((_, after)) = rest.split_once('/') {
            return Ok(format!("assets/{new_ns}/{after}"));
        }
    }
    Err(CoreError::Internal(format!(
        "cannot apply namespace to path: {path}"
    )))
}

pub fn extract_namespace(path: &str) -> Option<String> {
    let path = validate_relative_asset_path(path).ok()?;
    let rest = path.strip_prefix("assets/")?;
    rest.split('/').next().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(mode: SaveMode) -> SaveOptions {
        SaveOptions {
            mode,
            target_path: None,
            namespace: None,
        }
    }

    #[test]
    fn namespace_replaces_first_segment() {
        let out = apply_namespace(
            "assets/minecraft/textures/block/stone.png",
            "create",
        )
        .expect("namespace");
        assert_eq!(out, "assets/create/textures/block/stone.png");
    }

    #[test]
    fn rename_uses_entry_target() {
        let mut options = opts(SaveMode::Rename);
        options.target_path = Some("assets/test/textures/block/custom.png".to_string());
        let out = resolve_output_path(
            "assets/minecraft/textures/block/stone.png",
            Some("assets/minecraft/textures/block/stone_v2.png"),
            &options,
        )
        .expect("rename");
        assert_eq!(out, "assets/minecraft/textures/block/stone_v2.png");
    }
}
