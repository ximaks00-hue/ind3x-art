use crate::dto::{AssetEntry, AssetKind};

/// Classify a normalized forward-slash path inside a Minecraft resource source.
pub fn classify_path(relative_path: &str) -> Option<AssetEntry> {
    let path = relative_path.replace('\\', "/");
    let path = path.trim_start_matches("./");

    if path == "pack.mcmeta" {
        return Some(entry(
            "minecraft",
            path,
            AssetKind::PackMeta,
            "pack.mcmeta".to_string(),
        ));
    }

    const ASSETS: &str = "assets/";
    if !path.starts_with(ASSETS) {
        return None;
    }

    let rest = &path[ASSETS.len()..];
    let (namespace, rest) = rest.split_once('/')?;
    if namespace.is_empty() || namespace.contains(':') {
        return None;
    }
    if rest.is_empty() {
        return None;
    }

    if rest == "pack.mcmeta" {
        return Some(entry(namespace, path, AssetKind::PackMeta, "pack.mcmeta".to_string()));
    }

    let (section, after_section) = rest.split_once('/')?;

    if section == "textures" {
        let normalized_path = normalize_classified_path(path);
        if path.ends_with(".png.mcmeta") {
            let name = file_name(&normalized_path);
            return Some(entry(
                namespace,
                normalized_path.as_str(),
                AssetKind::TextureMeta,
                name,
            ));
        }
        if path.ends_with(".png") {
            let name = file_name(&normalized_path);
            return Some(entry(
                namespace,
                normalized_path.as_str(),
                AssetKind::Texture,
                name,
            ));
        }
    }

    if section == "models" && path.ends_with(".json") {
        if let Some(model_path) = after_section.strip_suffix(".json") {
            if let Some(sub) = model_path.strip_prefix("block/") {
                return Some(entry(namespace, path, AssetKind::BlockModel, file_name(sub)));
            }
            if let Some(sub) = model_path.strip_prefix("item/") {
                return Some(entry(namespace, path, AssetKind::ItemModel, file_name(sub)));
            }
        }
    }

    if section == "blockstates" && path.ends_with(".json") {
        if let Some(name) = after_section.strip_suffix(".json") {
            return Some(entry(namespace, path, AssetKind::Blockstate, file_name(name)));
        }
    }

    if section == "lang" && path.ends_with(".json") {
        return Some(entry(namespace, path, AssetKind::Lang, file_name(path)));
    }

    if section == "sounds" {
        return Some(entry(namespace, path, AssetKind::Sound, file_name(path)));
    }

    if path.ends_with(".json") || path.ends_with(".png") || path.ends_with(".ogg") {
        return Some(entry(namespace, path, AssetKind::Other, file_name(path)));
    }

    None
}

fn entry(namespace: &str, path: &str, kind: AssetKind, display_name: String) -> AssetEntry {
    AssetEntry {
        id: format!("{namespace}:{path}"),
        kind,
        namespace: namespace.to_string(),
        path: path.to_string(),
        display_name,
        linked_model_count: None,
    }
}

fn file_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

fn normalize_classified_path(path: &str) -> String {
    path.replace("/textures/blocks/", "/textures/block/")
        .replace("/textures/items/", "/textures/item/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_texture() {
        let e = classify_path("assets/minecraft/textures/block/stone.png").unwrap();
        assert_eq!(e.kind, AssetKind::Texture);
        assert_eq!(e.namespace, "minecraft");
    }

    #[test]
    fn classifies_blockstate() {
        let e = classify_path("assets/create/blockstates/cogwheel.json").unwrap();
        assert_eq!(e.kind, AssetKind::Blockstate);
        assert_eq!(e.namespace, "create");
    }

    #[test]
    fn classifies_legacy_texture_path() {
        let e = classify_path("assets/minecraft/textures/blocks/stone.png").unwrap();
        assert_eq!(e.kind, AssetKind::Texture);
        assert_eq!(e.path, "assets/minecraft/textures/block/stone.png");
    }
}
