use specta::Type;
use thiserror::Error;

#[derive(Debug, Error, Type)]
pub enum CoreError {
    #[error("I/O error: {0}")]
    #[specta(skip)]
    Io(#[from] std::io::Error),

    #[error("cache error: {0}")]
    #[specta(skip)]
    Cache(#[from] sled::Error),

    #[error("archive error: {0}")]
    Archive(String),

    #[error("operation cancelled")]
    Cancelled,

    #[error("project not found")]
    ProjectNotFound,

    #[error("asset not found: {0}")]
    AssetNotFound(String),

    #[error("model not found: {0}")]
    ModelNotFound(String),

    #[error("invalid pack: {0}")]
    InvalidPack(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("unavailable: {0}")]
    Unavailable(String),

    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Debug, serde::Serialize, Type)]
pub struct CoreErrorPayload {
    pub code: String,
    pub message: String,
}

impl CoreError {
    pub fn to_payload(&self) -> CoreErrorPayload {
        CoreErrorPayload {
            code: match self {
                CoreError::Io(_) => "io",
                CoreError::Cache(_) => "cache",
                CoreError::Archive(_) => "archive",
                CoreError::Cancelled => "cancelled",
                CoreError::ProjectNotFound => "projectNotFound",
                CoreError::AssetNotFound(_) => "assetNotFound",
                CoreError::ModelNotFound(_) => "modelNotFound",
                CoreError::InvalidPack(_) => "invalidPack",
                CoreError::InvalidInput(_) => "invalidInput",
                CoreError::Unavailable(_) => "unavailable",
                CoreError::Internal(_) => "internal",
            }
            .to_string(),
            message: user_facing_message(self),
        }
    }
}

/// IPC-safe error text — no absolute filesystem paths or raw OS diagnostics.
fn user_facing_message(err: &CoreError) -> String {
    match err {
        CoreError::Io(io) => user_facing_io_message(io),
        CoreError::Cache(_) => "cache operation failed".to_string(),
        CoreError::Archive(msg) => redact_absolute_paths(msg),
        CoreError::Cancelled => "operation cancelled".to_string(),
        CoreError::ProjectNotFound => "project not found".to_string(),
        CoreError::AssetNotFound(path) => format!("asset not found: {path}"),
        CoreError::ModelNotFound(id) => format!("model not found: {id}"),
        CoreError::InvalidPack(msg) => redact_absolute_paths(msg),
        CoreError::InvalidInput(msg) => redact_absolute_paths(msg),
        CoreError::Unavailable(msg) => redact_absolute_paths(msg),
        CoreError::Internal(msg) => redact_absolute_paths(msg),
    }
}

fn user_facing_io_message(err: &std::io::Error) -> String {
    use std::io::ErrorKind;
    match err.kind() {
        ErrorKind::NotFound => "file not found".to_string(),
        ErrorKind::PermissionDenied => "permission denied".to_string(),
        ErrorKind::AlreadyExists => "file already exists".to_string(),
        ErrorKind::InvalidInput => "invalid file path".to_string(),
        ErrorKind::TimedOut => "operation timed out".to_string(),
        ErrorKind::Interrupted => "operation interrupted".to_string(),
        _ => "I/O operation failed".to_string(),
    }
}

fn redact_absolute_paths(message: &str) -> String {
    let mut out = String::with_capacity(message.len());
    let mut i = 0;
    let bytes = message.as_bytes();
    while i < bytes.len() {
        let rest = &message[i..];
        if let Some(skipped) = skip_absolute_path_prefix(rest) {
            out.push_str("<path>");
            i += skipped;
            continue;
        }
        if let Some(ch) = message[i..].chars().next() {
            out.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    if out == message {
        message.to_string()
    } else {
        out
    }
}

fn skip_absolute_path_prefix(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return Some(path_token_len(s));
    }
    if s.starts_with("//") || s.starts_with("\\\\") {
        return Some(path_token_len(s));
    }
    if s.starts_with('/') && !s.starts_with("assets/") {
        return Some(path_token_len(s));
    }
    None
}

fn path_token_len(s: &str) -> usize {
    s.char_indices()
        .find(|(_, ch)| ch.is_whitespace())
        .map(|(idx, _)| idx)
        .unwrap_or(s.len())
}

impl serde::Serialize for CoreError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_payload().serialize(serializer)
    }
}

pub type CoreResult<T> = Result<T, CoreError>;

/// Log non-fatal cache/index invalidation failures (stale entry cleanup, etc.).
pub fn log_if_err<T>(result: CoreResult<T>, context: &'static str) {
    if let Err(ref err) = result {
        tracing::warn!(context, error = %err, "non-fatal operation failed");
    }
}

impl From<zip::result::ZipError> for CoreError {
    fn from(value: zip::result::ZipError) -> Self {
        CoreError::Archive(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind};

    #[test]
    fn io_payload_omits_os_path() {
        let err = CoreError::Io(Error::new(
            ErrorKind::NotFound,
            r#"The system cannot find the file specified. (os error 2): C:\Users\Secret\pack.jar"#,
        ));
        let payload = err.to_payload();
        assert_eq!(payload.code, "io");
        assert_eq!(payload.message, "file not found");
        assert!(!payload.message.contains('\\'));
        assert!(!payload.message.contains("Users"));
    }

    #[test]
    fn internal_payload_redacts_windows_paths() {
        let err = CoreError::Internal(
            "failed to open C:\\Users\\Max\\secret\\pack.jar: access denied".to_string(),
        );
        let payload = err.to_payload();
        assert!(payload.message.contains("<path>"));
        assert!(!payload.message.contains("Users"));
    }

    #[test]
    fn archive_payload_redacts_windows_paths() {
        let err = CoreError::Archive(
            "Cannot open archive C:\\Users\\Secret\\pack.zip: invalid central directory"
                .to_string(),
        );
        let payload = err.to_payload();
        assert!(payload.message.contains("<path>"));
        assert!(!payload.message.contains("Users"));
    }

    #[test]
    fn asset_paths_are_preserved_in_payload() {
        let err = CoreError::AssetNotFound("assets/minecraft/textures/block/stone.png".to_string());
        let payload = err.to_payload();
        assert!(payload.message.contains("assets/minecraft"));
    }
}
