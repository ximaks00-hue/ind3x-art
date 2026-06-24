use std::collections::HashMap;

use serde_json::Value;

use crate::model::types::{RawBlockstate, RawMultipart, RawVariantModel};

/// Parse a variant key into block-state properties.
///
/// Supports comma-separated `prop=value` pairs and JSON objects.
pub fn parse_variant_state(key: &str) -> HashMap<String, String> {
    let key = key.trim();
    if key.is_empty() || key == "default" {
        return HashMap::new();
    }

    if key.starts_with('{') {
        return serde_json::from_str::<HashMap<String, String>>(key).unwrap_or_default();
    }

    key.split(',')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            let k = k.trim();
            let v = v.trim();
            if k.is_empty() {
                None
            } else {
                Some((k.to_string(), v.to_string()))
            }
        })
        .collect()
}

fn property_matches(expected: &str, actual: &str) -> bool {
    expected.split('|').any(|candidate| candidate == actual)
}

/// Minecraft blockstate `when` values may be strings (`"true"`) or JSON booleans (`true`).
fn when_value_as_str(value: &Value) -> Option<&str> {
    if let Some(text) = value.as_str() {
        return Some(text);
    }
    if let Some(flag) = value.as_bool() {
        return Some(if flag { "true" } else { "false" });
    }
    None
}

/// Returns true when a multipart `when` clause matches the given block state.
pub fn matches_when(when: &Value, state: &HashMap<String, String>) -> bool {
    match when {
        Value::Object(map) => matches_when_object(map, state),
        _ => false,
    }
}

fn matches_when_object(
    when: &serde_json::Map<String, Value>,
    state: &HashMap<String, String>,
) -> bool {
    for (key, value) in when {
        if key == "OR" {
            let Some(items) = value.as_array() else {
                return false;
            };
            return items.iter().any(|item| matches_when(item, state));
        }
        if key == "AND" {
            let Some(items) = value.as_array() else {
                return false;
            };
            return items.iter().all(|item| matches_when(item, state));
        }

        let Some(expected) = when_value_as_str(value) else {
            return false;
        };
        let actual = state.get(key).map(String::as_str).unwrap_or("");
        if !property_matches(expected, actual) {
            return false;
        }
    }
    true
}

/// Collect variant models that apply for a multipart blockstate at the given state.
pub fn resolve_multipart_models(
    blockstate: &RawBlockstate,
    state: &HashMap<String, String>,
) -> Vec<RawVariantModel> {
    let Some(parts) = &blockstate.multipart else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for part in parts {
        if part_applies(part, state) {
            match &part.apply {
                crate::model::types::MultipartApply::Single(model) => out.push(model.clone()),
                crate::model::types::MultipartApply::Multiple(models) => {
                    out.extend(models.iter().cloned());
                }
            }
        }
    }
    out
}

fn part_applies(part: &RawMultipart, state: &HashMap<String, String>) -> bool {
    match &part.when {
        None => true,
        Some(when) => matches_when(when, state),
    }
}

/// Build preview variant keys for multipart-only blockstates.
pub fn multipart_variant_keys(blockstate: &RawBlockstate) -> Vec<(RawVariantModel, String)> {
    let Some(parts) = &blockstate.multipart else {
        return Vec::new();
    };

    let mut keys: Vec<String> = vec!["default".to_string()];

    for part in parts {
        if let Some(when) = &part.when {
            let serialized = when.to_string();
            if !keys.iter().any(|k| k == &serialized) {
                keys.push(serialized);
            }
        }
    }

    keys.into_iter()
        .map(|key| {
            let state = parse_variant_state(&key);
            let models = resolve_multipart_models(blockstate, &state);
            let _label = if models.is_empty() {
                "minecraft:block/cube".to_string()
            } else {
                models
                    .iter()
                    .map(|m| m.model.as_str())
                    .collect::<Vec<_>>()
                    .join(" + ")
            };
            let preview = models.into_iter().next().unwrap_or(RawVariantModel {
                model: "block/cube".to_string(),
                x: 0,
                y: 0,
                z: 0,
                uvlock: false,
                weight: 1,
            });
            (preview, key)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse::parse_blockstate;

    #[test]
    fn matches_simple_property() {
        let when: Value = serde_json::json!({ "north": "true" });
        let mut state = HashMap::new();
        state.insert("north".to_string(), "true".to_string());
        assert!(matches_when(&when, &state));

        state.insert("north".to_string(), "false".to_string());
        assert!(!matches_when(&when, &state));
    }

    #[test]
    fn matches_boolean_property() {
        let when: Value = serde_json::json!({ "north": true });
        let mut state = HashMap::new();
        state.insert("north".to_string(), "true".to_string());
        assert!(matches_when(&when, &state));

        state.insert("north".to_string(), "false".to_string());
        assert!(!matches_when(&when, &state));
    }

    #[test]
    fn matches_pipe_alternatives() {
        let when: Value = serde_json::json!({ "facing": "north|south" });
        let mut state = HashMap::new();
        state.insert("facing".to_string(), "south".to_string());
        assert!(matches_when(&when, &state));
    }

    #[test]
    fn matches_or_clause() {
        let when: Value = serde_json::json!({
            "OR": [
                { "north": "true" },
                { "south": "true" }
            ]
        });
        let mut state = HashMap::new();
        state.insert("south".to_string(), "true".to_string());
        assert!(matches_when(&when, &state));
    }

    #[test]
    fn resolves_fence_multipart() {
        let json = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/multipart_pack/assets/minecraft/blockstates/test_fence.json"
        ));
        let blockstate = parse_blockstate(json.as_bytes()).expect("parse");
        let mut state = HashMap::new();
        state.insert("north".to_string(), "true".to_string());

        let models = resolve_multipart_models(&blockstate, &state);
        assert_eq!(models.len(), 2);
        assert!(models.iter().any(|m| m.model.contains("post")));
        assert!(models.iter().any(|m| m.model.contains("side")));
    }

    #[test]
    fn always_applies_parts_without_when() {
        let json = include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/fixtures/multipart_pack/assets/minecraft/blockstates/test_fence.json"
        ));
        let blockstate = parse_blockstate(json.as_bytes()).expect("parse");
        let models = resolve_multipart_models(&blockstate, &HashMap::new());
        assert_eq!(models.len(), 1);
        assert!(models[0].model.contains("post"));
    }
}
