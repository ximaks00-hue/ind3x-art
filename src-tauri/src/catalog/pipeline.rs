use crate::dto::{AssetEntry, CatalogEntry};
use crate::source::AssetSource;

use super::builder::{build_from_entries_with_options, CatalogBuildOptions};
use super::dedup::dedup_catalog;

/// Inputs shared by full catalog builds and incremental patches.
pub struct CatalogBuildCtx<'a> {
    pub assets: &'a [AssetEntry],
    pub source: Option<&'a dyn AssetSource>,
    pub language: &'a str,
    pub tab_order: Option<&'a super::creative_tabs::CreativeTabOrder>,
}

impl<'a> CatalogBuildCtx<'a> {
    pub fn new(
        assets: &'a [AssetEntry],
        source: Option<&'a dyn AssetSource>,
        language: &'a str,
        tab_order: Option<&'a super::creative_tabs::CreativeTabOrder>,
    ) -> Self {
        Self {
            assets,
            source,
            language,
            tab_order,
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
                tab_order: ctx.tab_order,
                ..Default::default()
            },
        );
        dedup_catalog(slice)
    }
}

pub fn build_deduped_catalog(ctx: &CatalogBuildCtx<'_>) -> Vec<CatalogEntry> {
    DefaultCatalogPipeline.build(ctx)
}
