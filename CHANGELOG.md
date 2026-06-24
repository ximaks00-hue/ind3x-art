# Changelog

All notable changes to **inD3X Art** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-24

### Added

#### Block Studio (Creative Catalog)

- **Studio workspace mode** — toggle Classic / Studio in the title bar; Studio replaces Explorer with a Minecraft-style creative catalog grid (9×N, virtualized).
- **Rust `catalog/` module** — `build_from_entries`, lang display names, heuristic categories, dedup, texture enrichment, sled cache (`catalog:v1:{fingerprint}`), paginated `query_catalog` with fuzzy search and facet counts.
- **IPC** — `query_catalog`, `get_catalog_entry`, `get_catalog_facets`, `resolve_catalog_entry`; types in `bindings.ts` / `catalogTypes.ts`.
- **Catalog UI** — `CatalogPanel`, `CatalogSearch` (fuzzy toggle), category tabs, keyboard navigation, recent picks row, error/retry empty states.
- **Icon pipeline** — tier-1 texture preview + tier-2 WebGL GUI bake (`catalogIconPipeline`), LRU cache (500 MB budget), shimmer loading, failure badges, concurrent bake queue (3 workers).
- **BlockStudioViewport** — dedicated 3D + face paint toolbar: variant picker, biome tint presets, Orbit/Paint, camera presets; `TextureNavigator` for multipart face chips.
- **Studio onboarding** — separate tour (`STUDIO_ONBOARDING_STEPS`), tooltip hints, status bar labels (catalog total · entry · face · texture).
- **Session restore** — persists `studioSelectedCatalogId` and `studioCatalogCategory` across sessions.
- **Comparator lite** — dirty texture badge on catalog cells.

#### Tests & fixtures

- Fixtures: `simple_pack` (blockstate + lang + PNG), `multipart_pack` (fence post/side), `studio_pack` (20 blocks), extended `legacy_pack` coverage.
- Vitest: catalog store/query, icon pipeline, face nav, studio pipeline scale, onboarding steps.
- Playwright: `studio-workflow.spec.ts` (UI click catalog → paint → save), Classic regression toggle; native WebDriver scaffold (`studio-webdriver.spec.ts`).
- Manual QA checklist: **[docs/STUDIO_QA.md](docs/STUDIO_QA.md)**; architecture doc **[docs/BLOCK_STUDIO.md](docs/BLOCK_STUDIO.md)**.

#### Other

- `catalogService`, `explorerService`, `backupService`, `assetService` — frontend IPC service layer.
- `viewerPreferencesSync` — viewer lighting/grid prefs synced from settings.
- `moveSelection` editor helper; thumbnail cache tests.

### Changed

- **StatusBar** — Studio mode shows catalog entry count instead of raw asset index total.
- **useStudioFaceBootstrap** — paint + default top face only on first select per asset; Orbit mode preserved when switching faces.
- **ViewerErrorState** — Studio variant with Retry and Open in Classic.
- **Catalog search** — debounced query in store; stale-response guard uses consistent filter key (fixes false “No matches”).
- **Save / backup / watcher** — incremental hardening across Rust save pipeline and folder source.
- **CI** — integration tests include Block Studio workflow; optional native E2E job unchanged.

### Fixed

- Silent catalog IPC failures now surface via toast + inline error state.
- Icon bake failures show warning badge with reason instead of silent letter fallback.
- `resetQuery` clears stale catalog total during refetch.
- Multipart catalog entries resolve `texture_paths` after enrichment.
- Dedup audit logging for collapsed block/item aliases.

## [0.2.0] - 2026-06-24

### Added

- **tauri-specta** — typed IPC bindings (`src/ipc/bindings.ts`) generated from Rust commands; `spectaClient` + thin `client` wrapper.
- **Unified 3D paint** — line/rect/ellipse preview overlay on mesh faces (`FaceShapePreview`); fill/wand via shared `paintInteraction` + pixel worker in 3D.
- **Explorer decomposition** — `ExplorerHeader`, `ExplorerAssetList`, `useExplorerInspector`.
- **Premium UX** — onboarding tour, command palette 2.0, status bar 2.0, session restore, screenshot export options, tooltip hints.
- **Tests** — shape preview + fill/wand unit tests; integration e2e for mock paint pipeline; visual regression baseline; native WebDriver scaffold (`playwright.native.config.ts`).
- **CI** — bundle size budget, llvm-cov, optional `native-e2e` job when `TAURI_WEBDRIVER_URL` is set.

### Changed

- `types.ts` re-exports from `bindings.ts` (removed legacy `generated.ts` / `export_types` bin).
- `gen:types` runs `export_bindings` only; drift check targets `bindings.ts`.
- `read_recent_logs` uses `u32` instead of `usize` for Specta/TypeScript compatibility.
- Main bundle ~64 KB gzip (lazy onboarding, fewer font weights); Three.js remains code-split.

### Fixed

- `WindowControls` no longer crashes the web UI outside Tauri (Playwright / Vite-only smoke tests).
- ESLint `react-hooks` violations across App shell, editor, and palette.
- Clippy: `write_texture_to_folder` wired into save path; `asset_details` lint.
- Unique sled cache path per test run (avoids DB lock in parallel `cargo test`).
- Playwright selectors and onboarding overlay handling for stable e2e.

## [0.1.0] - 2026-06-23

### Added

- Initial release: asset indexer, explorer, 3D viewer, texture editor, save pipeline, Tauri 2 desktop shell.

[0.3.0]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ximaks00-hue/ind3x-art/releases/tag/v0.1.0
