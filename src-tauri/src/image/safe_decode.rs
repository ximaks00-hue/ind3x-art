use std::io::Cursor;

use image::{DynamicImage, ImageReader, Limits};

use crate::error::{CoreError, CoreResult};

/// Standard 8-byte PNG file signature.
pub const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

/// Max compressed PNG bytes accepted from disk / IPC payloads.
pub const MAX_TEXTURE_COMPRESSED_BYTES: usize = 16 * 1024 * 1024;

/// Max decoded width/height for texture images.
pub const MAX_TEXTURE_DIMENSION: u32 = 8192;

/// Max decoded allocation for a single texture (RGBA8 at 8192² ≈ 256 MiB; cap lower).
pub const MAX_TEXTURE_DECODE_ALLOC: u64 = 64 * 1024 * 1024;

pub fn texture_decode_limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_TEXTURE_DIMENSION);
    limits.max_image_height = Some(MAX_TEXTURE_DIMENSION);
    limits.max_alloc = Some(MAX_TEXTURE_DECODE_ALLOC);
    limits
}

pub fn validate_png_bytes(bytes: &[u8]) -> CoreResult<()> {
    validate_png_header(bytes)?;
    decode_png_with_limits(bytes).map(|_| ())
}

/// Signature and compressed-size check only — no image decode.
pub fn validate_png_header(bytes: &[u8]) -> CoreResult<()> {
    if bytes.len() < PNG_SIGNATURE.len() || &bytes[..PNG_SIGNATURE.len()] != PNG_SIGNATURE {
        return Err(CoreError::InvalidInput("not a valid PNG".to_string()));
    }
    if bytes.len() > MAX_TEXTURE_COMPRESSED_BYTES {
        return Err(CoreError::InvalidInput(format!(
            "png exceeds max size of {MAX_TEXTURE_COMPRESSED_BYTES} bytes"
        )));
    }
    Ok(())
}

pub fn decode_png_with_limits(bytes: &[u8]) -> CoreResult<DynamicImage> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| CoreError::Internal(format!("texture format detection failed: {e}")))?;
    reader.limits(texture_decode_limits());
    reader
        .decode()
        .map_err(|e| CoreError::InvalidInput(format!("invalid png texture: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_png_header_accepts_minimal_signature_without_decode() {
        let mut png = PNG_SIGNATURE.to_vec();
        png.extend_from_slice(&[0; 64]);
        validate_png_header(&png).expect("header ok");
    }

    #[test]
    fn validate_png_header_rejects_short_bytes() {
        let err = validate_png_header(b"\x89PNG").expect_err("too short");
        assert!(matches!(err, crate::error::CoreError::InvalidInput(_)));
    }
}
