use crate::dto::TextureAnimationMeta;
use crate::model::types::{RawAnimation, RawMcMeta};

pub fn animation_from_mcmeta(meta: &RawMcMeta, texture_height: u32) -> Option<TextureAnimationMeta> {
    let animation = meta.animation.as_ref()?;
    Some(build_animation_meta(animation, texture_height))
}

pub fn build_animation_meta(animation: &RawAnimation, texture_height: u32) -> TextureAnimationMeta {
    let frame_height = animation.height.unwrap_or(texture_height);
    let frame_width = animation.width.unwrap_or(0);

    TextureAnimationMeta {
        frametime: animation.frametime.max(1),
        interpolate: animation.interpolate,
        frame_width,
        frame_height,
        frames: parse_animation_frames(&animation.frames),
    }
}

pub fn parse_animation_frames(frames: &[serde_json::Value]) -> Vec<u32> {
    let mut out = Vec::new();
    for frame in frames {
        match frame {
            serde_json::Value::Number(n) => {
                if let Some(index) = n.as_u64() {
                    out.push(index as u32);
                }
            }
            serde_json::Value::Object(map) => {
                if let Some(index) = map.get("index").and_then(|v| v.as_u64()) {
                    out.push(index as u32);
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::parse::parse_mcmeta;

    #[test]
    fn parses_animation_frames() {
        let json = br#"{
            "animation": {
                "frametime": 4,
                "interpolate": true,
                "frames": [0, 1, {"index": 2, "time": 8}, 1]
            }
        }"#;
        let meta = parse_mcmeta(json).expect("parse");
        let anim = animation_from_mcmeta(&meta, 16).expect("animation");
        assert_eq!(anim.frametime, 4);
        assert!(anim.interpolate);
        assert_eq!(anim.frames, vec![0, 1, 2, 1]);
        assert_eq!(anim.frame_height, 16);
    }
}
