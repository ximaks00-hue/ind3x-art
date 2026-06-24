use crate::error::{CoreError, CoreResult};
use crate::source::AssetSource;

/// Minecraft resource pack format from `pack.mcmeta`.
#[derive(Debug, Clone, Copy, Default)]
pub struct PackInfo {
    pub pack_format: Option<u32>,
}

impl PackInfo {
    pub fn is_legacy(&self) -> bool {
        self.pack_format.is_some_and(|f| f < 6)
    }
}

pub fn read_pack_info(source: &dyn AssetSource) -> PackInfo {
    let bytes = match source.read("pack.mcmeta") {
        Ok(b) => b,
        Err(_) => {
            if let Ok(b) = source.read("assets/minecraft/pack.mcmeta") {
                b
            } else {
                return PackInfo {
                    pack_format: detect_pack_format_heuristic(source),
                };
            }
        }
    };

    #[derive(serde::Deserialize)]
    struct Root {
        pack: Option<PackSection>,
    }
    #[derive(serde::Deserialize)]
    struct PackSection {
        pack_format: Option<u32>,
    }

    let from_mcmeta = serde_json::from_slice::<Root>(&bytes)
        .ok()
        .and_then(|root| root.pack)
        .and_then(|pack| pack.pack_format);

    PackInfo {
        pack_format: from_mcmeta.or_else(|| detect_pack_format_heuristic(source)),
    }
}

/// Guess pack format from path layout when `pack.mcmeta` is missing.
pub fn detect_pack_format_heuristic(source: &dyn AssetSource) -> Option<u32> {
    let paths = source.list_entries().ok()?;
    let has_legacy_blocks = paths
        .iter()
        .any(|p| p.contains("/textures/blocks/") || p.contains("textures/blocks/"));
    let has_modern_block = paths
        .iter()
        .any(|p| p.contains("/textures/block/") || p.contains("textures/block/"));
    if has_legacy_blocks && !has_modern_block {
        Some(3)
    } else if has_modern_block {
        Some(12)
    } else {
        None
    }
}

/// Normalize a resource path to the modern 1.13+ layout when needed.
#[allow(dead_code)]
pub fn normalize_resource_path(path: &str, pack: &PackInfo) -> String {
    let path = path.replace('\\', "/");
    if !pack.is_legacy() {
        return path;
    }

    path.replace("/textures/blocks/", "/textures/block/")
        .replace("/textures/items/", "/textures/item/")
        .replace("textures/blocks/", "textures/block/")
        .replace("textures/items/", "textures/item/")
}

/// Normalize a texture reference from model JSON (`block/stone` or legacy `blocks/stone`).
pub fn normalize_texture_ref(texture_ref: &str, _pack: &PackInfo) -> String {
    if texture_ref.starts_with('#') || texture_ref.contains(':') {
        return texture_ref.to_string();
    }

    texture_ref
        .strip_prefix("blocks/")
        .map(|rest| format!("block/{rest}"))
        .or_else(|| texture_ref.strip_prefix("items/").map(|rest| format!("item/{rest}")))
        .unwrap_or_else(|| texture_ref.to_string())
}

pub fn normalize_model_path(model_path: &str, pack: &PackInfo) -> String {
    if !pack.is_legacy() {
        return model_path.to_string();
    }

    model_path
        .strip_prefix("blocks/")
        .map(|rest| format!("block/{rest}"))
        .unwrap_or_else(|| model_path.to_string())
}

#[allow(dead_code)]
pub fn read_pack_format_from_bytes(bytes: &[u8]) -> CoreResult<Option<u32>> {
    #[derive(serde::Deserialize)]
    struct Root {
        pack: Option<PackSection>,
    }
    #[derive(serde::Deserialize)]
    struct PackSection {
        pack_format: Option<u32>,
    }

    let root: Root = serde_json::from_slice(bytes)
        .map_err(|e| CoreError::Internal(format!("pack.mcmeta parse failed: {e}")))?;
    Ok(root.pack.and_then(|p| p.pack_format))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_texture_paths() {
        let pack = PackInfo {
            pack_format: Some(3),
        };
        assert_eq!(
            normalize_resource_path(
                "assets/demo/textures/blocks/stone.png",
                &pack
            ),
            "assets/demo/textures/block/stone.png"
        );
        assert_eq!(
            normalize_texture_ref("blocks/stone", &pack),
            "block/stone"
        );
    }

    #[test]
    fn leaves_modern_paths_unchanged() {
        let pack = PackInfo {
            pack_format: Some(34),
        };
        assert_eq!(
            normalize_texture_ref("block/stone", &pack),
            "block/stone"
        );
    }

    #[test]
    fn normalizes_blocks_prefix_without_pack_mcmeta() {
        let pack = PackInfo::default();
        assert_eq!(
            normalize_texture_ref("blocks/stone", &pack),
            "block/stone"
        );
        assert_eq!(
            normalize_texture_ref("items/apple", &pack),
            "item/apple"
        );
    }
}
