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
            message: self.to_string(),
        }
    }
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
