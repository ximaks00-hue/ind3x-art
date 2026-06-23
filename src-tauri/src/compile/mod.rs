use std::collections::HashMap;

use crate::dto::{
    DisplayTransform, ModelRotation, RenderCuboid, RenderFace, RenderableKind, RenderableModel,
    TextureMetaInfo, VariantKey,
};
use crate::error::CoreResult;
use crate::model::multipart::multipart_variant_keys;
use crate::model::normalize::PackInfo;
use crate::model::types::{
    resolve_texture_value_with_pack, ResolvedModel, RawDisplay, RawElement, RawFace, RawVariantModel,
};
use crate::resolve::ModelRegistry;

pub fn compile_renderable(
    resolved: &ResolvedModel,
    namespace: &str,
    variant: Option<&RawVariantModel>,
    pack: &PackInfo,
    registry: &ModelRegistry<'_>,
) -> CoreResult<RenderableModel> {
    let kind = if resolved.is_item_generated {
        RenderableKind::ItemGenerated
    } else {
        RenderableKind::Block
    };

    let mut texture_refs = HashMap::new();
    for (key, value) in &resolved.textures {
        if let Some(path) = resolve_texture_value_with_pack(value, namespace, &resolved.textures, pack) {
            texture_refs.insert(key.clone(), path);
        }
    }

    let cuboids: Vec<RenderCuboid> = resolved
        .elements
        .iter()
        .map(|el| compile_element(el, namespace, &resolved.textures, &mut texture_refs, pack))
        .collect();

    let model_rotation = variant
        .map(|v| ModelRotation {
            x: v.x,
            y: v.y,
            z: v.z,
            uvlock: v.uvlock,
        })
        .unwrap_or_default();

    let display = compile_display(&resolved.display);
    let texture_meta = collect_texture_meta(&texture_refs, registry)?;

    Ok(RenderableModel {
        kind,
        cuboids,
        texture_refs,
        texture_meta,
        model_rotation,
        display,
        ambient_occlusion: resolved.ambient_occlusion,
        model_id: resolved.model_id.clone(),
    })
}

pub fn compile_multipart_renderable(
    registry: &mut ModelRegistry<'_>,
    namespace: &str,
    variants: &[RawVariantModel],
    pack: &PackInfo,
) -> CoreResult<RenderableModel> {
    let mut all_cuboids = Vec::new();
    let mut texture_refs = HashMap::new();
    let mut display = HashMap::new();
    let mut ambient_occlusion = true;
    let mut model_id = String::new();

    for variant in variants {
        let (m_ns, m_path) = crate::model::types::normalize_model_ref(&variant.model, namespace);
        let resolved = registry.resolve_model(&m_ns, &m_path)?;
        let partial = compile_renderable(&resolved, &m_ns, Some(variant), pack, registry)?;
        all_cuboids.extend(partial.cuboids);
        texture_refs.extend(partial.texture_refs);
        display.extend(partial.display);
        ambient_occlusion &= partial.ambient_occlusion;
        if model_id.is_empty() {
            model_id = partial.model_id;
        } else {
            model_id.push_str(" + ");
            model_id.push_str(&partial.model_id);
        }
    }

    let texture_meta = collect_texture_meta(&texture_refs, registry)?;

    Ok(RenderableModel {
        kind: RenderableKind::Multipart,
        cuboids: all_cuboids,
        texture_refs,
        texture_meta,
        model_rotation: ModelRotation::default(),
        display,
        ambient_occlusion,
        model_id,
    })
}

fn compile_display(display: &HashMap<String, RawDisplay>) -> HashMap<String, DisplayTransform> {
    display
        .iter()
        .map(|(slot, raw)| {
            (
                slot.clone(),
                DisplayTransform {
                    rotation: [
                        raw.rotation[0] as f32,
                        raw.rotation[1] as f32,
                        raw.rotation[2] as f32,
                    ],
                    translation: [
                        raw.translation[0] as f32,
                        raw.translation[1] as f32,
                        raw.translation[2] as f32,
                    ],
                    scale: [
                        raw.scale[0] as f32,
                        raw.scale[1] as f32,
                        raw.scale[2] as f32,
                    ],
                },
            )
        })
        .collect()
}

fn collect_texture_meta(
    texture_refs: &HashMap<String, String>,
    registry: &ModelRegistry<'_>,
) -> CoreResult<HashMap<String, TextureMetaInfo>> {
    let mut out = HashMap::new();
    let mut seen = std::collections::HashSet::new();

    for path in texture_refs.values() {
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Some(meta) = registry.texture_meta_for_path(path)? {
            out.insert(path.clone(), meta);
        }
    }

    Ok(out)
}

fn compile_element(
    element: &RawElement,
    namespace: &str,
    textures: &HashMap<String, String>,
    texture_refs: &mut HashMap<String, String>,
    pack: &PackInfo,
) -> RenderCuboid {
    let faces: Vec<RenderFace> = element
        .faces
        .iter()
        .map(|(dir, face)| compile_face(dir, face, element, namespace, textures, texture_refs, pack))
        .collect();

    RenderCuboid {
        from: [
            element.from[0] as f32,
            element.from[1] as f32,
            element.from[2] as f32,
        ],
        to: [
            element.to[0] as f32,
            element.to[1] as f32,
            element.to[2] as f32,
        ],
        rotation: element.rotation.as_ref().map(|r| crate::dto::ElementRotation {
            origin: [r.origin[0] as f32, r.origin[1] as f32, r.origin[2] as f32],
            axis: r.axis.clone(),
            angle: r.angle as f32,
            rescale: r.rescale,
        }),
        faces,
        shade: element.shade.unwrap_or(true),
    }
}

fn compile_face(
    direction: &str,
    face: &RawFace,
    element: &RawElement,
    namespace: &str,
    textures: &HashMap<String, String>,
    texture_refs: &mut HashMap<String, String>,
    pack: &PackInfo,
) -> RenderFace {
    let uv = face.uv.unwrap_or_else(|| default_uv(direction, element));
    let texture_path = resolve_texture_value_with_pack(&face.texture, namespace, textures, pack)
        .unwrap_or_else(|| "assets/minecraft/textures/misc/missing.png".to_string());

    if face.texture.starts_with('#') {
        texture_refs.insert(face.texture[1..].to_string(), texture_path.clone());
    }

    RenderFace {
        direction: direction.to_string(),
        uv: [
            uv[0] as f32,
            uv[1] as f32,
            uv[2] as f32,
            uv[3] as f32,
        ],
        texture: texture_path,
        rotation: face.rotation.unwrap_or(0) as u16,
        tintindex: face.tintindex.unwrap_or(-1),
        cullface: face.cullface.clone(),
    }
}

fn default_uv(direction: &str, element: &RawElement) -> [f64; 4] {
    let (from, to) = (&element.from, &element.to);
    match direction {
        "down" => [from[0], from[2], to[0], to[2]],
        "up" => [from[0], from[2], to[0], to[2]],
        "north" => [from[0], from[1], to[0], to[1]],
        "south" => [from[0], from[1], to[0], to[1]],
        "west" => [from[2], from[1], to[2], to[1]],
        "east" => [from[2], from[1], to[2], to[1]],
        _ => [0.0, 0.0, 16.0, 16.0],
    }
}

pub fn list_variant_keys(blockstate: &crate::model::types::RawBlockstate) -> Vec<VariantKey> {
    if blockstate.multipart.is_some() && blockstate.variants.is_empty() {
        return multipart_variant_keys(blockstate)
            .into_iter()
            .map(|(model, key)| VariantKey {
                key,
                model: model.model,
                x: model.x,
                y: model.y,
                z: model.z,
                uvlock: model.uvlock,
            })
            .collect();
    }

    crate::resolve::collect_variant_models(blockstate)
        .into_iter()
        .map(|(model, key)| VariantKey {
            key,
            model: model.model,
            x: model.x,
            y: model.y,
            z: model.z,
            uvlock: model.uvlock,
        })
        .collect()
}
