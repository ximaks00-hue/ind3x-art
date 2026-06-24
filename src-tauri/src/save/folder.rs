use std::fs;
use std::path::Path;

use crate::error::CoreResult;
use crate::source::safe_join_under_root;

pub fn write_texture_to_folder(
    root: &Path,
    entry_path: &str,
    data: &[u8],
) -> CoreResult<()> {
    let full = safe_join_under_root(root, entry_path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(full, data)?;
    Ok(())
}
