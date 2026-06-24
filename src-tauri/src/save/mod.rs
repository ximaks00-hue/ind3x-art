use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};

use crate::dto::{SaveMode, SaveOptions, SourceKind, TextureSaveEntry};
use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, safe_join_under_root};

pub mod backup;
pub mod folder;
pub mod jar;
pub mod modes;

pub use backup::{
    create_backup, list_backups, restore_backup_by_id, restore_backup_from_known_path,
};
pub use jar::rebuild_jar_atomic;

#[derive(Debug, Clone)]
pub struct DecodedTexture {
    pub path: String,
    pub bytes: Vec<u8>,
}

/// Max decoded PNG size accepted from frontend save payloads.
pub const MAX_TEXTURE_DECODE_BYTES: usize = 16 * 1024 * 1024;
/// Max base64 string length for `decode_texture_entry` (~16 MiB decoded).
const MAX_TEXTURE_BASE64_LEN: usize = (MAX_TEXTURE_DECODE_BYTES / 3) * 4 + 4;

pub fn decode_texture_entry(path: String, png_base64: String) -> CoreResult<DecodedTexture> {
    if png_base64.len() > MAX_TEXTURE_BASE64_LEN {
        return Err(CoreError::InvalidInput(format!(
            "texture base64 exceeds max length of {MAX_TEXTURE_BASE64_LEN} bytes"
        )));
    }
    let bytes = STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| CoreError::Internal(format!("texture base64 decode failed: {e}")))?;
    validate_png(&bytes)?;
    Ok(DecodedTexture {
        path: normalize_zip_path(&path),
        bytes,
    })
}

pub fn validate_png(bytes: &[u8]) -> CoreResult<()> {
    if !bytes.starts_with(b"\x89PNG") {
        return Err(CoreError::InvalidInput("not a valid PNG".to_string()));
    }
    if bytes.len() > MAX_TEXTURE_DECODE_BYTES {
        return Err(CoreError::InvalidInput(format!(
            "png exceeds max size of {MAX_TEXTURE_DECODE_BYTES} bytes"
        )));
    }
    image::load_from_memory(bytes)
        .map_err(|e| CoreError::Internal(format!("invalid png texture: {e}")))?;
    Ok(())
}

pub fn backup_jar(jar_path: &Path) -> CoreResult<PathBuf> {
    if !jar_path.is_file() {
        return Err(CoreError::Internal(format!(
            "jar not found for backup: {}",
            jar_path.display()
        )));
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_path = jar_path.with_extension(format!("jar.{stamp}.bak"));
    std::fs::copy(jar_path, &backup_path)?;
    Ok(backup_path)
}

pub fn backup_folder_file(
    root: &Path,
    entry_path: &str,
    session_stamp: u64,
) -> CoreResult<Option<PathBuf>> {
    let rel = normalize_zip_path(entry_path);
    let source = safe_join_under_root(root, &rel)?;
    if !source.is_file() {
        return Ok(None);
    }

    let backup_dest = root
        .join(".ind3x-backups")
        .join(session_stamp.to_string())
        .join(
            crate::source::validate_relative_asset_path(&rel)?
                .replace('/', std::path::MAIN_SEPARATOR_STR),
        );

    if let Some(parent) = backup_dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&source, &backup_dest)?;
    Ok(Some(backup_dest))
}

#[derive(Debug, Clone)]
pub struct PreparedTexture {
    pub original_path: String,
    pub output_path: String,
    pub bytes: Vec<u8>,
}

pub fn prepare_textures(
    entries: Vec<TextureSaveEntry>,
    options: &SaveOptions,
) -> CoreResult<Vec<PreparedTexture>> {
    entries
        .into_iter()
        .map(|entry| {
            let decoded = decode_texture_entry(entry.path, entry.png_base64)?;
            let output_path = modes::resolve_output_path(
                &decoded.path,
                entry.target_path.as_deref(),
                options,
            )?;
            Ok(PreparedTexture {
                original_path: decoded.path,
                output_path,
                bytes: decoded.bytes,
            })
        })
        .collect()
}

pub fn export_textures_to_folder(
    target_root: &Path,
    textures: &[DecodedTexture],
) -> CoreResult<Vec<String>> {
    let mut saved_paths = Vec::with_capacity(textures.len());
    for texture in textures {
        folder::write_texture_to_folder(target_root, &texture.path, &texture.bytes)?;
        saved_paths.push(normalize_zip_path(&texture.path));
    }
    Ok(saved_paths)
}

pub fn save_prepared_textures(
    source_path: &Path,
    source_kind: SourceKind,
    textures: Vec<PreparedTexture>,
    options: &SaveOptions,
) -> CoreResult<(Vec<String>, Vec<String>, Option<String>)> {
    if textures.is_empty() {
        return Ok((Vec::new(), Vec::new(), None));
    }

    let original_paths: Vec<String> = textures
        .iter()
        .map(|t| t.original_path.clone())
        .collect();

    if options.mode == SaveMode::ExportFolder {
        let target = options
            .target_path
            .as_deref()
            .ok_or_else(|| CoreError::Internal("export requires target_path".to_string()))?;
        let target_root = PathBuf::from(target)
            .canonicalize()
            .or_else(|_| {
                let path = PathBuf::from(target);
                if path.is_absolute() {
                    Ok(path)
                } else {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidInput,
                        "export target must be absolute",
                    ))
                }
            })
            .map_err(|e| CoreError::Internal(format!("invalid export target path: {e}")))?;
        std::fs::create_dir_all(&target_root)?;

        let decoded: Vec<DecodedTexture> = textures
            .into_iter()
            .map(|t| DecodedTexture {
                path: t.output_path,
                bytes: t.bytes,
            })
            .collect();
        let saved_paths = export_textures_to_folder(&target_root, &decoded)?;
        return Ok((original_paths, saved_paths, None));
    }

    let decoded: Vec<DecodedTexture> = textures
        .into_iter()
        .map(|t| DecodedTexture {
            path: t.output_path,
            bytes: t.bytes,
        })
        .collect();
    let saved_paths: Vec<String> = decoded.iter().map(|t| t.path.clone()).collect();
    let backup = save_textures_to_source(source_path, source_kind, decoded)?.1;
    Ok((original_paths, saved_paths, backup))
}

pub fn save_textures_to_source(
    source_path: &Path,
    source_kind: SourceKind,
    textures: Vec<DecodedTexture>,
) -> CoreResult<(Vec<String>, Option<String>)> {
    use std::collections::HashMap;

    if textures.is_empty() {
        return Ok((Vec::new(), None));
    }

    match source_kind {
        SourceKind::Jar => {
            let replacements: HashMap<String, Vec<u8>> = textures
                .into_iter()
                .map(|t| (t.path, t.bytes))
                .collect();
            let saved_paths: Vec<String> = replacements.keys().cloned().collect();
            let backup = backup_jar(source_path)?;
            rebuild_jar_atomic(source_path, &replacements)?;
            Ok((saved_paths, Some(backup.to_string_lossy().to_string())))
        }
        SourceKind::Folder => {
            use backup::{
                revert_partial_folder_apply, write_session_manifest, FolderSaveSessionManifest,
            };

            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0) as u64;
            let backup_session = source_path
                .join(".ind3x-backups")
                .join(stamp.to_string());
            std::fs::create_dir_all(&backup_session)?;
            let backup_path = Some(backup_session.to_string_lossy().into_owned());
            let staging = source_path.join(format!(".ind3x-staging-{stamp}"));
            std::fs::create_dir_all(&staging)?;

            let mut manifest = FolderSaveSessionManifest::default();
            let mut staged: Vec<(PathBuf, PathBuf, String)> =
                Vec::with_capacity(textures.len());

            for texture in &textures {
                let rel = normalize_zip_path(&texture.path);
                let dest = safe_join_under_root(source_path, &rel)?;
                if dest.is_file() {
                    backup_folder_file(source_path, &texture.path, stamp)?;
                    manifest.overwritten.push(rel.clone());
                } else {
                    manifest.created.push(rel.clone());
                }

                let staged_path = safe_join_under_root(&staging, &rel)?;
                if let Some(parent) = staged_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&staged_path, &texture.bytes)?;
                staged.push((staged_path, dest, texture.path.clone()));
            }

            write_session_manifest(&backup_session, &manifest)?;

            let mut saved_paths = Vec::with_capacity(textures.len());
            let mut applied: Vec<String> = Vec::with_capacity(textures.len());
            let apply_result = (|| -> CoreResult<()> {
                for (staged_path, dest, path) in staged {
                    if let Some(parent) = dest.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    std::fs::rename(&staged_path, &dest).or_else(|_| {
                        std::fs::copy(&staged_path, &dest)?;
                        std::fs::remove_file(&staged_path)?;
                        Ok::<(), std::io::Error>(())
                    })?;
                    applied.push(path.clone());
                    saved_paths.push(path);
                }
                Ok(())
            })();

            if let Err(err) = apply_result {
                let _ = revert_partial_folder_apply(
                    source_path,
                    &backup_session,
                    &applied,
                    &manifest,
                );
                let _ = std::fs::remove_dir_all(&staging);
                return Err(err);
            }

            let _ = std::fs::remove_dir_all(&staging);
            Ok((saved_paths, backup_path))
        }

    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::save::folder::write_texture_to_folder;
    use crate::source::{AssetSource, FolderSource};

    fn sample_png() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap()
    }

    #[test]
    fn rejects_oversized_base64_payload() {
        let huge = "A".repeat(super::MAX_TEXTURE_BASE64_LEN + 1);
        let err = decode_texture_entry("assets/test/textures/block/a.png".to_string(), huge)
            .expect_err("oversized base64");
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn rejects_non_png_bytes() {
        let bad = STANDARD.encode(b"not a png");
        let err = decode_texture_entry("assets/test/textures/block/a.png".to_string(), bad)
            .expect_err("non-png");
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn folder_write_creates_texture_file() {
        let dir = std::env::temp_dir().join(format!("ind3x-folder-save-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let png = sample_png();
        write_texture_to_folder(&dir, "assets/test/textures/block/a.png", &png).expect("write");

        let source = FolderSource::new(&dir).expect("folder");
        let read_back = source
            .read("assets/test/textures/block/a.png")
            .expect("read");
        assert_eq!(read_back, png);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn namespace_save_writes_to_new_path() {
        let dir = std::env::temp_dir().join(format!("ind3x-ns-save-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let png = sample_png();
        write_texture_to_folder(
            &dir,
            "assets/minecraft/textures/block/stone.png",
            &png,
        )
        .expect("seed");

        let options = SaveOptions {
            mode: SaveMode::Namespace,
            target_path: None,
            namespace: Some("create".to_string()),
        };
        let prepared = vec![PreparedTexture {
            original_path: "assets/minecraft/textures/block/stone.png".to_string(),
            output_path: "assets/create/textures/block/stone.png".to_string(),
            bytes: png.clone(),
        }];
        let (_, saved, _) =
            save_prepared_textures(&dir, SourceKind::Folder, prepared, &options).expect("save");
        assert_eq!(saved, vec!["assets/create/textures/block/stone.png"]);

        let source = FolderSource::new(&dir).expect("folder");
        let read_back = source
            .read("assets/create/textures/block/stone.png")
            .expect("read");
        assert_eq!(read_back, png);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn namespace_save_rollback_removes_created_path() {
        use crate::save::backup::restore_backup_from_known_path;

        let dir = std::env::temp_dir().join(format!("ind3x-ns-rollback-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let png = sample_png();
        write_texture_to_folder(
            &dir,
            "assets/minecraft/textures/block/stone.png",
            &png,
        )
        .expect("seed");

        let options = SaveOptions {
            mode: SaveMode::Namespace,
            target_path: None,
            namespace: Some("create".to_string()),
        };
        let prepared = vec![PreparedTexture {
            original_path: "assets/minecraft/textures/block/stone.png".to_string(),
            output_path: "assets/create/textures/block/stone.png".to_string(),
            bytes: png,
        }];
        let (_, _, backup_path) =
            save_prepared_textures(&dir, SourceKind::Folder, prepared, &options).expect("save");
        let backup_path = backup_path.expect("backup");

        assert!(dir.join("assets/create/textures/block/stone.png").is_file());

        restore_backup_from_known_path(&dir, SourceKind::Folder, &backup_path).expect("rollback");
        assert!(!dir.join("assets/create/textures/block/stone.png").exists());
        assert!(dir.join("assets/minecraft/textures/block/stone.png").is_file());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_overwrite_backup_path_is_recognized_session_root() {
        use crate::save::backup::{list_backups, restore_backup_from_known_path};

        let dir = std::env::temp_dir().join(format!("ind3x-folder-backup-path-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let png = sample_png();
        write_texture_to_folder(
            &dir,
            "assets/minecraft/textures/block/stone.png",
            &png,
        )
        .expect("seed");

        let options = SaveOptions {
            mode: SaveMode::Overwrite,
            target_path: None,
            namespace: None,
        };
        let prepared = vec![PreparedTexture {
            original_path: "assets/minecraft/textures/block/stone.png".to_string(),
            output_path: "assets/minecraft/textures/block/stone.png".to_string(),
            bytes: png,
        }];
        let (_, _, backup_path) =
            save_prepared_textures(&dir, SourceKind::Folder, prepared, &options).expect("save");
        let backup_path = backup_path.expect("backup path");
        let backups = list_backups(&dir, SourceKind::Folder).expect("list");
        assert!(
            backups.iter().any(|b| b.path == backup_path),
            "journal backup path must match a listed session root"
        );

        restore_backup_from_known_path(&dir, SourceKind::Folder, &backup_path).expect("restore");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn export_folder_does_not_touch_source() {
        let dir = std::env::temp_dir().join(format!("ind3x-export-save-{}", std::process::id()));
        let export_dir = dir.join("export");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let png = sample_png();
        write_texture_to_folder(&dir, "assets/test/textures/block/a.png", &png).expect("seed");

        let options = SaveOptions {
            mode: SaveMode::ExportFolder,
            target_path: Some(export_dir.to_string_lossy().to_string()),
            namespace: None,
        };
        let prepared = vec![PreparedTexture {
            original_path: "assets/test/textures/block/a.png".to_string(),
            output_path: "assets/test/textures/block/a.png".to_string(),
            bytes: png.clone(),
        }];
        save_prepared_textures(&dir, SourceKind::Folder, prepared, &options).expect("export");

        let exported = export_dir.join("assets/test/textures/block/a.png");
        assert!(exported.is_file());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn folder_write_rejects_traversal_paths() {
        let dir = std::env::temp_dir().join(format!("ind3x-folder-guard-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let png = sample_png();

        let result = write_texture_to_folder(&dir, "../outside.png", &png);
        assert!(result.is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
