use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};

use crate::dto::{SaveMode, SaveOptions, SourceKind, TextureSaveEntry};
use crate::error::{CoreError, CoreResult};
use crate::source::normalize_zip_path;

pub mod backup;
pub mod folder;
pub mod jar;
pub mod modes;

pub use backup::{create_backup, list_backups, restore_backup, restore_backup_by_id};
pub use folder::write_texture_to_folder;
pub use jar::rebuild_jar_atomic;

#[derive(Debug, Clone)]
pub struct DecodedTexture {
    pub path: String,
    pub bytes: Vec<u8>,
}

pub fn decode_texture_entry(path: String, png_base64: String) -> CoreResult<DecodedTexture> {
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

pub fn backup_folder_file(root: &Path, entry_path: &str) -> CoreResult<Option<PathBuf>> {
    let rel = normalize_zip_path(entry_path);
    let source = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    if !source.is_file() {
        return Ok(None);
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup_dest = root
        .join(".ind3x-backups")
        .join(stamp.to_string())
        .join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));

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
        let rel = normalize_zip_path(&texture.path);
        let dest = target_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&dest, &texture.bytes)?;
        saved_paths.push(rel);
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
        let target_root = PathBuf::from(target);
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
            let mut saved_paths = Vec::with_capacity(textures.len());
            let mut first_backup: Option<String> = None;

            for texture in textures {
                if let Some(backup) = backup_folder_file(source_path, &texture.path)? {
                    if first_backup.is_none() {
                        first_backup = Some(
                            backup
                                .parent()
                                .and_then(|p| p.parent())
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|| backup.to_string_lossy().to_string()),
                        );
                    }
                }
                write_texture_to_folder(source_path, &texture.path, &texture.bytes)?;
                saved_paths.push(texture.path);
            }

            Ok((saved_paths, first_backup))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source::{AssetSource, FolderSource};

    fn sample_png() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap()
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
}
