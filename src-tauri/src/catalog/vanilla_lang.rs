use std::collections::HashMap;
use std::sync::OnceLock;

use super::lang::parse_lang_json;

fn en_us() -> &'static HashMap<String, String> {
    static MAP: OnceLock<HashMap<String, String>> = OnceLock::new();
    MAP.get_or_init(|| parse_lang_json(include_str!("../../assets/vanilla_lang/en_us.json")))
}

fn ru_ru() -> &'static HashMap<String, String> {
    static MAP: OnceLock<HashMap<String, String>> = OnceLock::new();
    MAP.get_or_init(|| parse_lang_json(include_str!("../../assets/vanilla_lang/ru_ru.json")))
}

/// Builtin vanilla translations when the opened pack has no lang entry (minecraft namespace only).
pub fn resolve_key(locale: &str, key: &str) -> Option<String> {
    if !key.contains(".minecraft.") {
        return None;
    }
    let primary = match locale {
        "ru_ru" => ru_ru(),
        _ => en_us(),
    };
    if let Some(value) = primary.get(key) {
        return Some(value.clone());
    }
    if locale == "ru_ru" {
        return en_us().get(key).cloned();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_stone_without_pack_lang() {
        assert_eq!(
            resolve_key("en_us", "block.minecraft.stone"),
            Some("Stone".to_string())
        );
    }

    #[test]
    fn resolves_russian_stone() {
        assert_eq!(
            resolve_key("ru_ru", "block.minecraft.stone"),
            Some("Камень".to_string())
        );
    }
}
