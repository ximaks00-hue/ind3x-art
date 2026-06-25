use std::fs;
use std::path::Path;

use crate::error::CoreResult;
use crate::source::prepare_file_write_under_root;

pub fn write_texture_to_folder(
    root: &Path,
    entry_path: &str,
    data: &[u8],
) -> CoreResult<()> {
    let full = prepare_file_write_under_root(root, entry_path)?;
    fs::write(full, data)?;
    Ok(())
}
