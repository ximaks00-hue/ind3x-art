use crate::dto::{AssetEntry, CatalogEntry};
use crate::source::AssetSource;

use super::builder::{build_from_entries_with_options, CatalogBuildOptions};
use super::dedup::dedup_catalog;

/// Inputs shared by full catalog builds and incremental patches.
pub struct CatalogBuildCtx<'a> {
    pub assets: &'a [AssetEntry],
    pub source: Option<&'a dyn AssetSource>,
    pub language: &'a str,
}

impl<'a> CatalogBuildCtx<'a> {
    pub fn new(
        assets: &'a [AssetEntry],
        source: Option<&'a dyn AssetSource>,
        language: &'a str,
    ) -> Self {
        Self {
            assets,
            source,
            language,
        }
    }
}

/// Shared catalog build pipeline: asset slice → rows → dedup.
pub trait CatalogPipeline {
    fn build(&self, ctx: &CatalogBuildCtx<'_>) -> Vec<CatalogEntry>;
}

pub struct DefaultCatalogPipeline;

impl CatalogPipeline for DefaultCatalogPipeline {
    fn build(&self, ctx: &CatalogBuildCtx<'_>) -> Vec<CatalogEntry> {
        let slice = build_from_entries_with_options(
            ctx.assets,
            ctx.source,
            CatalogBuildOptions {
                language: ctx.language,
                ..Default::default()
            },
        );
        dedup_catalog(slice)
    }
}

pub fn build_deduped_catalog(ctx: &CatalogBuildCtx<'_>) -> Vec<CatalogEntry> {
    DefaultCatalogPipeline.build(ctx)
}
