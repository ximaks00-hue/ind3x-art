use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::error::{CoreError, CoreResult};
use crate::source::normalize_zip_path;

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
    let dest = File::create(&temp_path)?;
    let mut writer = ZipWriter::new(dest);
    let options = SimpleFileOptions::default();

    let replace_set: HashSet<String> = replacements.keys().cloned().collect();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = normalize_zip_path(file.name());
        if file.is_dir() || replace_set.contains(&name) {
            continue;
        }
        writer.start_file(name.clone(), options)?;
        copy(&mut file, &mut writer)?;
    }

    for (path, data) in replacements {
        let needle = normalize_zip_path(path);
        writer.start_file(needle, options)?;
        writer.write_all(data)?;
    }

    writer
        .finish()
        .map_err(|e| CoreError::Internal(format!("zip finalize failed: {e}")))?;

    fs::rename(&temp_path, jar_path)?;
    Ok(())
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
}
