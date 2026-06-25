# Changelog

All notable changes to **inD3X Art** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-06-25

### Added

#### Performance & reliability (frontend)

- **Key-scoped catalog icon subscriptions** — cells re-render only when their icon key changes, not on every cache update.
- **Icon bake generation tokens** — stale pipeline resets no longer write outdated icons or exceed inflight limits.
- **Stable virtual grid range key** — catalog scroll no longer recomputes visible entries every frame.
- **Per-consumer animated textures** — shared cache textures are not mutated; inflight texture load deduplication.
- **Serialized face painting** — drag strokes queue with generation to prevent out-of-order commits.
- **Isolated FPS status** (`viewerFps.ts`, `StatusBarFps`) — ~2 Hz FPS updates no longer re-render the app shell.
- **`useWorkspaceMode`** — studio/classic transition orchestration moved out of `settingsStore`.
- **Service validation** — handle, page bounds, and icon base64 size checks in `app/services/*`.
- **Async screenshot export** — `toBlob` instead of synchronous `toDataURL`.
- **Project lifecycle tests** — overlapping `openSource`, listener dispose, reindex-after-unmount, poison-lock recovery.

#### Rust backend

- **Incremental index fingerprint** and texture-only save path skipping full rebuilds.
- **Path safety** (`path_safety.rs`) — TOCTOU checks, symlink/junction rejection on Windows and Unix.
- **Safe PNG decode** limits; JAR reads without global archive mutex; watcher debounce (300 ms).
- **App cache v2** under `app_cache_dir()`; graceful startup fatal dialog; poisoned lock recovery.
- **Async texture saves** via `spawn_blocking`; folder backup retention (10); aggregated index warnings.

#### CI

- **Rust clippy + tests** on `ubuntu-latest` and `macos-latest` cross-platform job.
- **Codecov** uploads no longer fail the pipeline on external upload errors.

### Changed

- `setIndexProgress` uses separate `indexTotal` — asset totals no longer jump during indexing.
- `withProgressToast` shows success toast only when work completes without error.
- `useSaveWorkflow` guards `setState` after unmount; hotkey handlers use stable ref (no listener churn).
- Item extrusion grid capped at 128²; bilinear UV inverse for rotated face hits; correct N/S/W/E cull predicates.
- Reusable offscreen icon render rig; Three.js dispose fixes on error paths and `UvDebugOverlay`.

### Fixed

- Catalog icon pipeline cancellation; `disposeObject3D` / texture branch leaks.
- Binary IPC for textures (`getTextureBinary` base64); async PNG encode worker for saves.
- Project open supersede / stale IPC cleanup; Tauri listener dispose on unmount.
- Face raycaster paint race; texture document eviction disposes canvases and viewer textures.

### Upgrade notes

- Rust app cache schema is **v2** (`ind3x-art/cache/v2/sled`). Legacy temp cache is ignored; reopen projects once after upgrade.
- No settings migration required.

## [0.3.2] - 2026-06-24

### Added

#### Editor & paint pipeline

- **Singleton pixel worker** (`pixelWorkerClient.ts`) — one shared Comlink worker per app session; avoids per-stroke worker spawn.
- **Sparse worker protocol** — fill/wand/pencil send pixel lists via `Comlink.transfer()` instead of full-frame diffs.
- **Layer pixel cache** (`textureDocumentCore.ts`) — `readLayerRgba` / `writeLayerRgba` cache with invalidation on commit.
- **Save path validation** (`savePathValidation.ts`) — inline namespace/rename validation in Save dialog.
- **Explorer source label** (`sourcePathLabel.ts`) — basename + full-path tooltip in header.

#### Tests & fixtures

- `pixelWorker.test.ts`, `paintWorkerOps.test.ts`, `savePathValidation.test.ts`, `backupService.test.ts`.
- `catalogIconGolden.test.ts`, expanded `compileGolden.test.ts`.
- Fixture packs: `pack.mcmeta` for simple/studio/multipart; `custom_block.png` for mymod lang pack.
- `rust-toolchain.toml` for reproducible Rust builds.

### Changed

#### CI / release

- **Release gate** — tag builds run validate (typecheck, lint, unit tests, clippy, `cargo test`, integration E2E) before Tauri bundle; single publish job avoids race on GitHub Releases.
- **Codecov** — upload steps use `secrets.CODECOV_TOKEN` directly (fixes skipped coverage uploads).
- **Vitest** — `VITE_E2E_MOCK` in test define; spike/perf tests excluded from default suite; coverage thresholds ratcheted to current baseline.
- **`scripts/ci.ps1`** — `npm.cmd` + explicit `$LASTEXITCODE` checks on Windows PowerShell 5.x.

#### UI & accessibility

- **Command palette** — combobox ARIA (`aria-activedescendant`, `role="option"`); command failures surface error toasts.
- **Session restore dialog** — `role="dialog"` on inner panel with `useId` title.
- **Toast host** — `aria-live="assertive"` for errors, `polite` for info/success.
- **Context menu** — measured viewport clamp + `createPortal` to `document.body`.
- **Panel error boundary** — resets when `children` change (new project without manual retry).
- **Button primitive** — `type="button"` cannot be overridden by spread props.
- Removed unused `Dialog` primitive (feature dialogs keep dedicated components).

#### Window chrome

- **Maximize / restore** — Tauri window permissions (`toggle-maximize`, `minimize`, `close`, `is-maximized`, `start-dragging`); `app-region: no-drag` on controls; icon toggles on resize; double-click title to maximize.

### Fixed

#### State & IPC

- **`finishOpen`** clears stale `selectedAsset` / `selectedAssetId` after reindex.
- **Comparator** — blocks 3D compare mode without a captured before-model.
- **E2E fault injection** — `readFaultConfig` returns `failOps`; mock IPC disabled in production builds (`!import.meta.env.PROD`).
- **`invalidateCatalogIconsForTextures`** wired through mock IPC in lifecycle tests.

#### Explorer, save & catalog services

- Inspector uses `node.id` not `path`; backup restore clears texture documents before reopen.
- Explorer keyboard scroll + stable nav index map; grouped view includes unknown asset kinds.
- Shared thumbnail inflight map; save dialog rename disabled when `dirtyCount !== 1`.
- Session restore abortable (no hard 1500 ms timeout); save path validation on rename/namespace.

#### Editor & viewer

- Face shape preview revision deps; move-selection OOB guard; Mcmeta editor error toast.
- `readAlphaGrid` capped at 512×512; full-texture copy uses document dimensions.
- Sparse paint worker tests no longer hang on async `e2eMock` import deadlock.

#### Rust backend

- **Multipart parser** — `when` clauses accept JSON booleans (`true`/`false`) in addition to strings.
- Custom block fixture uses `mymod:block/custom_block` texture (not vanilla stone).

#### E2E integration

- Session restore tests expect dialog title **"Restore last project?"**.
- Save failure test injects `failOps: ["saveBatch"]` (matches real save path).

## [0.3.1] - 2026-06-24

### Added

#### Linux distribution

- **AppImage** bundle target — portable Linux install without system packages; build via `npm run build:appimage` or `./scripts/build-linux.sh`.
- **Release CI** — [`.github/workflows/release.yml`](.github/workflows/release.yml) builds AppImage (Ubuntu 22.04) + NSIS (Windows) on every `v*` tag and uploads to GitHub Releases.
- **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)** — install, build-deps, and CI release documentation.

#### Block Studio & catalog (continued)

- **IC2 / texture-only packs** — split lang files, texture catalog seeds, creative tabs, icon cache on disk.
- **Studio UI** — `CatalogQuickRow`, `UnfoldPanel`, animation/texture previews, compare cells, session restore orchestration, keyboard nav, virtual grid split.
- **Project cache invalidation** — `invalidateProjectCaches({ explorer, catalog, icons, studio, thumbnails })` single entry point; `refreshCatalogCaches()` for catalog-only refresh.
- **`useAppStatusBar`** — status bar subscriptions extracted from `App.tsx` to reduce root re-renders.
- **`workspaceTransition`** — studio/classic workspace orchestration decoupled from `settingsStore`.
- **`AppErrorBoundary`** — top-level React error boundary in `main.tsx`.
- **`ReindexResult`** — separate `assetCount` / `catalogCount` from `reindex_project` IPC (fixes explorer pagination totals).
- **E2E fault injection** — `failOps` + `__E2E__.setFaultConfig()` for targeted mock failures; `failure-paths.spec.ts` integration tests.

#### Rust backend

- **IPC modularization** — `commands.rs` split into `project`, `catalog`, `assets`, `save`, `logging`, `helpers`.
- **Catalog pipeline** — patch invalidation, icon cache, texture catalog, query bench, integration tests.
- **Watcher / builtins** — fallible init, mutex skip on contention, fingerprint tests.

#### Tests

- `useProjectSource.test.tsx`, `useAppStatusBar.test.ts`, `onboardingHooks.test.tsx` (Rules-of-Hooks regression).
- Catalog/viewer RTL coverage: `CatalogPanel`, `CatalogCell`, `BlockStudioViewport`, `FaceRaycaster`.
- `catalogUtils.test.ts` split from store tests; expanded `catalogStore.test.ts`.
- Golden icon tests, studio resolve cache tests, mapWithConcurrency for dirty texture export.

### Changed

- **Viewer preferences** — lighting/grid/vignette/dev overlay read from `settingsStore` selectors (`viewerPreferencesSync`); `viewerStore` kept for runtime sync only.
- **Vite chunks** — catalog split into `catalog-panel`, `catalog-studio`, `catalog-icons`; `CatalogPanel` lazy-loaded in `App`.
- **TextureCanvas** — zoom cap aligned to 32×; brush cursor on separate RAF-throttled layer; parallel dirty PNG export (concurrency 4).
- **Open project flow** — catalog snapshot restore on failed reopen; single index-event transport (no duplicate Channel + listener).
- **Bootstrap errors** — IPC failure logs + user toast; `formatIpcError()` for open/rebuild toasts.
- **E2E security** — validated `localStorage` fault JSON; `__E2E__` stripped outside `DEV` + mock mode; production `VITE_E2E_MOCK` forced false in Vite define.

### Fixed

- Studio status bar **textureDirty** stale after save (`useDocumentRevision` in `useAppStatusBar`).
- Explorer **keyboard focus** index out of bounds after filter shrink.
- **openSource** error path: `indexStatus` stays `error` (clearProject no longer overwrites).
- Clipboard paste scoped to active texture path; onboarding/tooltip hooks order (APP-001/002).
- Icon pipeline worker counter reset; FaceRaycaster RAF coalescing; catalog search sort in Rust query.

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

[0.3.4]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.3.2...v0.3.4
[0.3.2]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ximaks00-hue/ind3x-art/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ximaks00-hue/ind3x-art/releases/tag/v0.1.0
