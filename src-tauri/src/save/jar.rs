use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::error::{CoreError, CoreResult};
use crate::source::{normalize_zip_path, validate_relative_asset_path};

/// Rebuild a JAR/ZIP by copying every entry except replacements.
///
/// **Limitation:** even a single texture save rewrites the entire archive (full unpack/repack).
/// Large mod JARs can take seconds and need temporary disk space equal to the archive size.
pub fn rebuild_jar_atomic(
    jar_path: &Path,
    replacements: &HashMap<String, Vec<u8>>,
) -> CoreResult<()> {
    use std::collections::HashSet;
    use std::io::copy;
    use zip::read::ZipArchive;

    let src = File::open(jar_path)?;
    let mut archive = ZipArchive::new(src)
        .map_err(|e| CoreError::Internal(format!("invalid zip/jar: {e}")))?;

    let temp_path = jar_path.with_extension("jar.tmp");
    let mut temp_guard = TempJarCleanup::new(temp_path.clone());

    let dest = File::create(&temp_path)?;
    let mut writer = ZipWriter::new(dest);

    let mut replace_set = HashSet::new();
    for path in replacements.keys() {
        let validated = validate_relative_asset_path(path)?;
        replace_set.insert(normalize_zip_path(&validated));
    }

    let mut copied_names = HashSet::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = normalize_zip_path(file.name());
        if file.is_dir() || replace_set.contains(&name) || !copied_names.insert(name.clone()) {
            continue;
        }
        let mut options = SimpleFileOptions::default().compression_method(file.compression());
        if let Some(modified) = file.last_modified() {
            options = options.last_modified_time(modified);
        }
        writer.start_file(name, options)?;
        copy(&mut file, &mut writer)?;
    }

    let default_options = SimpleFileOptions::default();
    for (path, data) in replacements {
        let validated = validate_relative_asset_path(path)?;
        let needle = normalize_zip_path(&validated);
        writer.start_file(needle, default_options)?;
        writer.write_all(data)?;
    }

    writer
        .finish()
        .map_err(|e| CoreError::Internal(format!("zip finalize failed: {e}")))?;

    fs::rename(&temp_path, jar_path)?;
    temp_guard.disarm();
    Ok(())
}

/// Remove a failed jar rebuild temp file on drop.
struct TempJarCleanup {
    path: PathBuf,
    active: bool,
}

impl TempJarCleanup {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            active: true,
        }
    }

    fn disarm(&mut self) {
        self.active = false;
    }
}

impl Drop for TempJarCleanup {
    fn drop(&mut self) {
        if self.active && self.path.is_file() {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::io::Write;

    use crate::source::{AssetSource, JarSource};

    fn sample_png() -> Vec<u8> {
        base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap()
    }

    fn write_test_jar(path: &Path, entries: &[(&str, &[u8])]) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        for (name, data) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(data).unwrap();
        }
        writer.finish().unwrap();
    }

    #[test]
    fn rebuild_jar_replaces_texture_entry() {
        let dir = std::env::temp_dir().join(format!("ind3x-save-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let jar_path = dir.join("pack.jar");
        let png = sample_png();
        write_test_jar(
            &jar_path,
            &[
                ("assets/minecraft/textures/block/stone.png", png.as_slice()),
                ("pack.mcmeta", br#"{"pack":{"pack_format":34}}"#),
            ],
        );

        let mut replacements = HashMap::new();
        let mut updated = sample_png();
        updated.extend_from_slice(&[0, 0, 0, 255]);
        replacements.insert(
            "assets/minecraft/textures/block/stone.png".to_string(),
            updated.clone(),
        );

        rebuild_jar_atomic(&jar_path, &replacements).expect("rebuild");

        let source = JarSource::new(&jar_path).expect("jar");
        let read_back = source
            .read("assets/minecraft/textures/block/stone.png")
            .expect("read");
        assert_eq!(read_back, updated);
        let meta = source.read("pack.mcmeta").expect("meta");
        assert_eq!(meta, br#"{"pack":{"pack_format":34}}"#);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebuild_jar_rejects_traversal_paths() {
        let dir = std::env::temp_dir().join(format!("ind3x-save-traversal-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let jar_path = dir.join("pack.jar");
        write_test_jar(&jar_path, &[("pack.mcmeta", br#"{"pack":{"pack_format":34}}"#)]);

        let mut replacements = HashMap::new();
        replacements.insert("../../evil.png".to_string(), sample_png());
        assert!(rebuild_jar_atomic(&jar_path, &replacements).is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
