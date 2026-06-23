# Testing

inD3X Art uses a layered test strategy: fast unit tests, browser smoke tests, and fixture-backed integration tests. Full native IPC requires the Tauri runtime.

## Quick reference

| Layer | Command | Backend | Coverage |
|-------|---------|---------|----------|
| Unit (Vitest) | `npm run test:unit` | jsdom + canvas polyfill | Pure logic, hooks, IPC helpers |
| Rust | `npm run test` | `cargo test` | Indexer, models, save pipeline |
| E2E smoke | `npm run test:e2e` | Vite dev server only | UI shell, hotkeys, panels |
| E2E integration | `npm run test:e2e:integration` | Vite + `VITE_E2E_MOCK` | Open → paint → save |
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
- `paintTestPixel()` — marks a texture dirty via the real editor pipeline
- `getSavedTextures()` — returns payloads sent to the mock save handler

```powershell
npm run test:e2e:integration
```

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

Fixtures: `tests/fixtures/simple_pack`, `multipart_pack`, `legacy_pack`.

## CI parity

`npm run ci` matches `.github/workflows/ci.yml`:

`typecheck` → `gen:types` → `lint` → `format:check` → `test:unit` → `clippy` → `test` → `build` → `test:e2e` → `test:e2e:integration`
