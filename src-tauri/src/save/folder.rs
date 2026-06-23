use std::fs;
use std::path::Path;

use crate::error::CoreResult;
use crate::source::normalize_zip_path;

pub fn write_texture_to_folder(
    root: &Path,
    entry_path: &str,
    data: &[u8],
) -> CoreResult<()> {
    let rel = normalize_zip_path(entry_path);
    let full = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(full, data)?;
    Ok(())
}
