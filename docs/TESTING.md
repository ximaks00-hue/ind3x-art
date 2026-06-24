# Testing

inD3X Art uses a layered test strategy: fast unit tests, browser smoke tests, and fixture-backed integration tests. Full native IPC requires the Tauri runtime.

## Quick reference

| Layer | Command | Backend | Coverage |
|-------|---------|---------|----------|
| Unit (Vitest) | `npm run test:unit` | jsdom + canvas polyfill | Pure logic, hooks, IPC helpers |
| Rust | `npm run test` | `cargo test` | Indexer, models, save pipeline |
| E2E smoke | `npm run test:e2e` | Vite dev server only | UI shell, hotkeys, panels |
| E2E integration | `npm run test:e2e:integration` | Vite + `VITE_E2E_MOCK` | Open → paint → save; Block Studio catalog flow |
| E2E native (optional) | `npm run test:e2e:native` | Tauri WebDriver | Studio toggle scaffold when `TAURI_WEBDRIVER_URL` set |
| Local CI | `npm run ci` | All of the above | Mirrors GitHub Actions |

## Vitest

Tests live next to source as `*.test.ts` / `*.test.tsx`.

```powershell
npm run test:unit          # single run
npm run test:unit:watch    # watch mode
```

Canvas-backed tests use `src/test/setup.ts` (node-canvas polyfill). IPC is mocked per test file where needed.

**Current coverage highlights:** `fuzzy`, `buildTree`, `tools`, `textureDocument`, `buildMesh`, `uvMapping`, `saveTextures`, `useAppBootstrap`, `useSaveWorkflow`.

## Playwright smoke tests

Runs against `npm run dev` without Tauri. Validates layout, command palette, shortcuts, explorer/editor chrome.

```powershell
npx playwright install chromium   # first run
npm run test:e2e
```

## Fixture integration tests (mock IPC)

When `VITE_E2E_MOCK=true`, the frontend uses `src/ipc/e2eMock.ts` instead of Tauri `invoke`. Playwright exposes `window.__E2E__` helpers:

- `openFixture()` — loads `tests/fixtures/simple_pack` assets into the store
- `openStudioFixture()` — fixture + Studio workspace + 2400-entry mock catalog
- `selectCatalogEntry(id)` — selects a catalog entry and loads it in the viewer
- `getCatalogTotal()` — returns mock catalog entry count (scale tests)
- `paintTestPixel()` — marks a texture dirty via the real editor pipeline
- `getSavedTextures()` — returns payloads sent to the mock save handler

```powershell
npm run test:e2e:integration
```

Integration tests include `fixture-workflow.spec.ts` (classic) and `studio-workflow.spec.ts` (Block Studio catalog → paint → save).

This covers **open → edit → save** without a live Rust backend. It does not replace Tauri WebDriver tests for filesystem/JAR I/O.

## Full Tauri integration (manual)

For native IPC, file watchers, and real JAR writes:

1. `npm run tauri dev`
2. Point Playwright `baseURL` to the webview URL, or use [tauri-driver](https://github.com/chippers/tauri-driver) / WebDriver2
3. Run tests against `tests/fixtures/simple_pack` on disk

## Rust tests

```powershell
cd src-tauri
cargo test
cargo clippy -- -D warnings
```

Fixtures: `tests/fixtures/simple_pack`, `multipart_pack`, `legacy_pack`, `studio_pack` (20 block catalog scale).

## Block Studio: mock E2E vs real acceptance

| What | Mock integration (`VITE_E2E_MOCK`) | Real Tauri |
|------|-----------------------------------|------------|
| Catalog build | `e2eCatalogFixture.ts` (2400 synthetic entries) | Rust `catalog::build_project_catalog` |
| Textures / resolve | Fixed 1×1 PNG, `FIXTURE_RENDERABLE` | Filesystem + sled cache |
| Save | In-memory mock | Disk + backup journal |
| UI wiring | ✅ catalog → paint → save | Manual [STUDIO_QA.md](./STUDIO_QA.md) |

Playwright `studio-workflow.spec.ts` now clicks **Test Stone** in the catalog grid (not only `__E2E__.selectCatalogEntry`). Full native flow: `npm run tauri dev` + STUDIO_QA checklist.

## Native WebDriver E2E (optional)

Scaffold tests live in `e2e/native/`. They are **not** part of the default `npm run ci` pipeline unless `TAURI_WEBDRIVER_URL` is configured in GitHub Actions (optional `native-e2e` job).

```powershell
# With tauri-driver / WebDriver listening on port 4444:
$env:TAURI_WEBDRIVER_URL = "http://127.0.0.1:4444"
npm run test:e2e:native
```

See [tauri-driver](https://github.com/chippers/tauri-driver) for wiring.

## CI parity

`npm run ci` matches `.github/workflows/ci.yml`:

`typecheck` → `gen:types` → `lint` → `format:check` → `test:unit` → `clippy` → `test` → `build` → `test:e2e` → `test:e2e:integration`

Optional workflow job `native-e2e` runs when `TAURI_WEBDRIVER_URL` is set as a repo variable or secret.
