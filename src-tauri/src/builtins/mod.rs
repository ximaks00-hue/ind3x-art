use std::collections::HashMap;

use crate::model::types::RawModel;

/// Vanilla models shipped with the Minecraft client (not present in mod JARs).
pub fn get_builtin_model(namespace: &str, model_path: &str) -> Option<RawModel> {
    if namespace != "minecraft" {
        return None;
    }
    BUILTIN_MODELS.get(model_path).cloned()
}

fn models() -> HashMap<&'static str, RawModel> {
    let mut map = HashMap::new();

    map.insert(
        "block/cube",
        serde_json::from_value(serde_json::json!({
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 16, 16],
                "faces": {
                    "down":  { "texture": "#down",  "cullface": "down" },
                    "up":    { "texture": "#up",    "cullface": "up" },
                    "north": { "texture": "#north", "cullface": "north" },
                    "south": { "texture": "#south", "cullface": "south" },
                    "west":  { "texture": "#west",  "cullface": "west" },
                    "east":  { "texture": "#east",  "cullface": "east" }
                }
            }]
        }))
        .expect("builtin cube"),
    );

    map.insert(
        "block/cube_all",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube",
            "textures": {
                "particle": "#all",
                "down": "#all",
                "up": "#all",
                "north": "#all",
                "east": "#all",
                "south": "#all",
                "west": "#all"
            }
        }))
        .expect("builtin cube_all"),
    );

    map.insert(
        "block/cube_column",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube",
            "textures": {
                "particle": "#side",
                "down": "#end",
                "up": "#end",
                "north": "#side",
                "east": "#side",
                "south": "#side",
                "west": "#side"
            }
        }))
        .expect("builtin cube_column"),
    );

    map.insert(
        "block/cross",
        serde_json::from_value(serde_json::json!({
            "ambientocclusion": false,
            "textures": { "particle": "#cross" },
            "elements": [
                {
                    "from": [0.8, 0, 8],
                    "to": [15.2, 16, 8],
                    "rotation": { "origin": [8, 8, 8], "axis": "y", "angle": 45, "rescale": true },
                    "shade": false,
                    "faces": {
                        "north": { "uv": [0, 0, 16, 16], "texture": "#cross" },
                        "south": { "uv": [0, 0, 16, 16], "texture": "#cross" }
                    }
                },
                {
                    "from": [8, 0, 0.8],
                    "to": [8, 16, 15.2],
                    "rotation": { "origin": [8, 8, 8], "axis": "y", "angle": 45, "rescale": true },
                    "shade": false,
                    "faces": {
                        "west": { "uv": [0, 0, 16, 16], "texture": "#cross" },
                        "east": { "uv": [0, 0, 16, 16], "texture": "#cross" }
                    }
                }
            ]
        }))
        .expect("builtin cross"),
    );

    map.insert(
        "item/generated",
        serde_json::from_value(serde_json::json!({
            "parent": "builtin/generated",
            "textures": { "layer0": "#layer0" }
        }))
        .expect("builtin item/generated"),
    );

    map.insert(
        "item/handheld",
        serde_json::from_value(serde_json::json!({
            "parent": "item/generated",
            "display": {
                "thirdperson_righthand": {
                    "rotation": [0, -90, 55],
                    "translation": [0, 4, 0.5],
                    "scale": [0.85, 0.85, 0.85]
                },
                "firstperson_righthand": {
                    "rotation": [0, -90, 25],
                    "translation": [1.13, 3.2, 1.13],
                    "scale": [0.68, 0.68, 0.68]
                }
            }
        }))
        .expect("builtin item/handheld"),
    );

    // block/orientable — front texture on the north face
    map.insert(
        "block/orientable",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube",
            "textures": {
                "particle": "#side",
                "down": "#bottom",
                "up": "#top",
                "north": "#front",
                "south": "#side",
                "east": "#side",
                "west": "#side"
            }
        }))
        .expect("builtin block/orientable"),
    );

    // block/orientable_vertical — top texture as front
    map.insert(
        "block/orientable_vertical",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube",
            "textures": {
                "particle": "#side",
                "down": "#side",
                "up": "#front",
                "north": "#side",
                "south": "#side",
                "east": "#side",
                "west": "#side"
            }
        }))
        .expect("builtin block/orientable_vertical"),
    );

    // block/cube_bottom_top
    map.insert(
        "block/cube_bottom_top",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube",
            "textures": {
                "particle": "#side",
                "down": "#bottom",
                "up": "#top",
                "north": "#side",
                "east": "#side",
                "south": "#side",
                "west": "#side"
            }
        }))
        .expect("builtin block/cube_bottom_top"),
    );

    // block/cube_column_horizontal (rotated pillar)
    map.insert(
        "block/cube_column_horizontal",
        serde_json::from_value(serde_json::json!({
            "parent": "block/cube_column",
            "textures": {
                "particle": "#side",
                "end": "#end",
                "side": "#side"
            }
        }))
        .expect("builtin block/cube_column_horizontal"),
    );

    // block/leaves — same as cube_all but no cullface
    map.insert(
        "block/leaves",
        serde_json::from_value(serde_json::json!({
            "ambientocclusion": false,
            "textures": { "particle": "#all" },
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 16, 16],
                "faces": {
                    "down":  { "texture": "#all", "tintindex": 0 },
                    "up":    { "texture": "#all", "tintindex": 0 },
                    "north": { "texture": "#all", "tintindex": 0 },
                    "south": { "texture": "#all", "tintindex": 0 },
                    "west":  { "texture": "#all", "tintindex": 0 },
                    "east":  { "texture": "#all", "tintindex": 0 }
                }
            }]
        }))
        .expect("builtin block/leaves"),
    );

    // block/thin_block (pane / glass pane body)
    map.insert(
        "block/thin_block",
        serde_json::from_value(serde_json::json!({
            "textures": { "particle": "#pane" },
            "elements": [{
                "from": [7, 0, 0],
                "to": [9, 16, 16],
                "faces": {
                    "down":  { "uv": [7, 0, 9, 16], "texture": "#pane" },
                    "up":    { "uv": [7, 0, 9, 16], "texture": "#pane" },
                    "north": { "uv": [7, 0, 9, 16], "texture": "#pane" },
                    "south": { "uv": [7, 0, 9, 16], "texture": "#pane" }
                }
            }]
        }))
        .expect("builtin block/thin_block"),
    );

    // block/torch — small flat billboard
    map.insert(
        "block/torch",
        serde_json::from_value(serde_json::json!({
            "ambientocclusion": false,
            "textures": { "torch": "#torch", "particle": "#torch" },
            "elements": [
                {
                    "from": [7, 0, 7],
                    "to": [9, 10, 9],
                    "shade": false,
                    "faces": {
                        "north": { "uv": [7, 6, 9, 16], "texture": "#torch" },
                        "south": { "uv": [7, 6, 9, 16], "texture": "#torch" },
                        "west":  { "uv": [7, 6, 9, 16], "texture": "#torch" },
                        "east":  { "uv": [7, 6, 9, 16], "texture": "#torch" },
                        "up":    { "uv": [7, 6, 9, 8],  "texture": "#torch" }
                    }
                }
            ]
        }))
        .expect("builtin block/torch"),
    );

    // block/slab (lower half default)
    map.insert(
        "block/slab",
        serde_json::from_value(serde_json::json!({
            "textures": {
                "particle": "#side",
                "bottom": "#bottom",
                "top": "#top",
                "side": "#side"
            },
            "elements": [{
                "from": [0, 0, 0],
                "to": [16, 8, 16],
                "faces": {
                    "down":  { "texture": "#bottom", "cullface": "down" },
                    "up":    { "texture": "#top" },
                    "north": { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "north" },
                    "south": { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "south" },
                    "west":  { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "west" },
                    "east":  { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "east" }
                }
            }]
        }))
        .expect("builtin block/slab"),
    );

    // block/slab_top (upper half)
    map.insert(
        "block/slab_top",
        serde_json::from_value(serde_json::json!({
            "parent": "block/slab",
            "elements": [{
                "from": [0, 8, 0],
                "to": [16, 16, 16],
                "faces": {
                    "down":  { "texture": "#bottom" },
                    "up":    { "texture": "#top", "cullface": "up" },
                    "north": { "uv": [0, 0, 16, 8], "texture": "#side", "cullface": "north" },
                    "south": { "uv": [0, 0, 16, 8], "texture": "#side", "cullface": "south" },
                    "west":  { "uv": [0, 0, 16, 8], "texture": "#side", "cullface": "west" },
                    "east":  { "uv": [0, 0, 16, 8], "texture": "#side", "cullface": "east" }
                }
            }]
        }))
        .expect("builtin block/slab_top"),
    );

    // block/stairs (bottom front step)
    map.insert(
        "block/stairs",
        serde_json::from_value(serde_json::json!({
            "textures": {
                "particle": "#side",
                "bottom": "#bottom",
                "top": "#top",
                "side": "#side"
            },
            "elements": [
                {
                    "from": [0, 0, 0], "to": [16, 8, 16],
                    "faces": {
                        "down":  { "texture": "#bottom", "cullface": "down" },
                        "up":    { "texture": "#top" },
                        "north": { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "north" },
                        "south": { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "south" },
                        "west":  { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "west" },
                        "east":  { "uv": [0, 8, 16, 16], "texture": "#side", "cullface": "east" }
                    }
                },
                {
                    "from": [8, 8, 0], "to": [16, 16, 16],
                    "faces": {
                        "up":    { "uv": [8, 0, 16, 16], "texture": "#top", "cullface": "up" },
                        "north": { "uv": [8, 0, 16, 8], "texture": "#side", "cullface": "north" },
                        "south": { "uv": [0, 0, 8, 8], "texture": "#side", "cullface": "south" },
                        "east":  { "uv": [0, 0, 16, 8], "texture": "#side", "cullface": "east" }
                    }
                }
            ]
        }))
        .expect("builtin block/stairs"),
    );

    // block/pressure_plate_up
    map.insert(
        "block/pressure_plate_up",
        serde_json::from_value(serde_json::json!({
            "textures": { "texture": "#texture", "particle": "#texture" },
            "elements": [{
                "from": [1, 0, 1], "to": [15, 1, 15],
                "faces": {
                    "down": { "uv": [1, 1, 15, 15], "texture": "#texture", "cullface": "down" },
                    "up":   { "uv": [1, 1, 15, 15], "texture": "#texture" },
                    "north":{ "uv": [1, 15, 15, 16], "texture": "#texture" },
                    "south":{ "uv": [1, 15, 15, 16], "texture": "#texture" },
                    "west": { "uv": [1, 15, 15, 16], "texture": "#texture" },
                    "east": { "uv": [1, 15, 15, 16], "texture": "#texture" }
                }
            }]
        }))
        .expect("builtin block/pressure_plate_up"),
    );

    map
}

static BUILTIN_MODELS: std::sync::LazyLock<HashMap<&'static str, RawModel>> =
    std::sync::LazyLock::new(models);
