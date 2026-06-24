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

    if !path.starts_with("assets/") {
        return None;
    }

    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 3 {
        return None;
    }

    let namespace = parts[1];
    if namespace.is_empty() || namespace.contains(':') {
        return None;
    }

    let tail = parts[2..].join("/");

    if tail == "pack.mcmeta" {
        return Some(entry(namespace, path, AssetKind::PackMeta, "pack.mcmeta".to_string()));
    }

    if parts[2] == "textures" {
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

    if parts[2] == "models" && path.ends_with(".json") {
        let model_path = parts[3..].join("/");
        let model_path = model_path.strip_suffix(".json").unwrap_or(&model_path);
        if model_path.starts_with("block/") {
            let name = file_name(model_path);
            return Some(entry(namespace, path, AssetKind::BlockModel, name));
        }
        if model_path.starts_with("item/") {
            let name = file_name(model_path);
            return Some(entry(namespace, path, AssetKind::ItemModel, name));
        }
    }

    if parts[2] == "blockstates" && path.ends_with(".json") {
        let name = file_name(parts[3..].join("/").trim_end_matches(".json"));
        return Some(entry(namespace, path, AssetKind::Blockstate, name));
    }

    if parts[2] == "lang" && path.ends_with(".json") {
        let name = file_name(path);
        return Some(entry(namespace, path, AssetKind::Lang, name));
    }

    if parts[2] == "sounds" {
        let name = file_name(path);
        return Some(entry(namespace, path, AssetKind::Sound, name));
    }

    if path.ends_with(".json") || path.ends_with(".png") || path.ends_with(".ogg") {
        let name = file_name(path);
        return Some(entry(namespace, path, AssetKind::Other, name));
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
