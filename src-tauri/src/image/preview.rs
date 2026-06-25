use base64::{engine::general_purpose::STANDARD, Engine};
use image::imageops::FilterType;
use image::GenericImageView;

use crate::dto::TexturePreview;
use crate::error::{CoreError, CoreResult};

use super::safe_decode::decode_png_with_limits;

pub const MAX_TEXTURE_PREVIEW_SIZE: u32 = 512;
pub const DEFAULT_TEXTURE_PREVIEW_SIZE: u32 = 32;
pub const MAX_TEXTURE_PREVIEW_BATCH: usize = 256;

pub fn clamp_texture_preview_size(max_size: Option<u32>) -> u32 {
    max_size
        .unwrap_or(DEFAULT_TEXTURE_PREVIEW_SIZE)
        .clamp(1, MAX_TEXTURE_PREVIEW_SIZE)
}

pub fn encode_texture_full(bytes: &[u8]) -> CoreResult<TexturePreview> {
    let img = decode_png_with_limits(bytes)?;
    let (w, h) = img.dimensions();
    Ok(TexturePreview {
        width: w,
        height: h,
        png_base64: STANDARD.encode(bytes),
    })
}

pub fn decode_texture_preview(bytes: &[u8], max_size: u32) -> CoreResult<TexturePreview> {
    let max_size = max_size.clamp(1, MAX_TEXTURE_PREVIEW_SIZE);
    let img = decode_png_with_limits(bytes)?;

    let (w, h) = img.dimensions();
    let resized = if w > max_size || h > max_size {
        img.resize(max_size, max_size, FilterType::Nearest)
    } else {
        img
    };

    let (rw, rh) = resized.dimensions();
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    resized
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| CoreError::Internal(format!("texture encode failed: {e}")))?;

    Ok(TexturePreview {
        width: rw,
        height: rh,
        png_base64: STANDARD.encode(buf),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_minimal_png() {
        let png = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap();
        let preview = decode_texture_preview(&png, 32).expect("preview");
        assert_eq!(preview.width, 1);
        assert!(!preview.png_base64.is_empty());
    }

    #[test]
    fn encodes_full_texture() {
        let png = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
            .unwrap();
        let full = encode_texture_full(&png).expect("full");
        assert_eq!(full.width, 1);
    }

    #[test]
    fn clamps_preview_max_size() {
        assert_eq!(super::clamp_texture_preview_size(None), 32);
        assert_eq!(super::clamp_texture_preview_size(Some(0)), 1);
        assert_eq!(super::clamp_texture_preview_size(Some(u32::MAX)), 512);
    }
}
