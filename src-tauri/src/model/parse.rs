use crate::error::{CoreError, CoreResult};
use crate::model::types::{RawBlockstate, RawMcMeta, RawModel};

pub fn parse_model(bytes: &[u8]) -> CoreResult<RawModel> {
    serde_json::from_slice(bytes)
        .map_err(|e| CoreError::InvalidPack(format!("model json parse failed: {e}")))
}

pub fn parse_blockstate(bytes: &[u8]) -> CoreResult<RawBlockstate> {
    serde_json::from_slice(bytes)
        .map_err(|e| CoreError::InvalidPack(format!("blockstate json parse failed: {e}")))
}

pub fn parse_mcmeta(bytes: &[u8]) -> CoreResult<RawMcMeta> {
    serde_json::from_slice(bytes)
        .map_err(|e| CoreError::InvalidInput(format!("mcmeta json parse failed: {e}")))
}
