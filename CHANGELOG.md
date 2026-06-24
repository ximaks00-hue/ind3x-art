# Changelog

All notable changes to **inD3X Art** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ximaks00-hue/ind3x-art/releases/tag/v0.1.0
