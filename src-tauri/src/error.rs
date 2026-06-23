use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("cache error: {0}")]
    Cache(#[from] sled::Error),

    #[error("archive error: {0}")]
    Archive(String),

    #[error("operation cancelled")]
    Cancelled,

    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Debug, serde::Serialize)]
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

impl From<zip::result::ZipError> for CoreError {
    fn from(value: zip::result::ZipError) -> Self {
        CoreError::Archive(value.to_string())
    }
}
