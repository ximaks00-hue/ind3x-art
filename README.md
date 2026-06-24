# inD3X Art

**Premium desktop studio for Minecraft mods and resource packs.**

Open a JAR or folder, browse assets with fuzzy search, preview block models in real-time 3D, paint textures on mesh faces, and save changes back to the source — with automatic backups and a save journal.

**Stack:** Tauri 2 · Rust · React 19 · TypeScript · Three.js · Vitest · Playwright

**Current version:** 0.3.1 — see [CHANGELOG.md](CHANGELOG.md)

[![CI](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/ci.yml/badge.svg)](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/ci.yml)
[![Release](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/release.yml/badge.svg)](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/release.yml)

**Author:** [ximaks00-hue](https://github.com/ximaks00-hue) · [ximaks00@gmail.com](mailto:ximaks00@gmail.com)

---

## Highlights

| Area | What you get |
|------|----------------|
| **Block Studio** | Creative catalog grid, lazy icon bake, variant/biome toolbar, face paint flow — [docs/BLOCK_STUDIO.md](docs/BLOCK_STUDIO.md) |
| **Indexer** | Parallel JAR/folder scan, sled cache, progressive asset stream |
| **Explorer** | Virtualized tree, Kind/Tree/List views, fuzzy search, facets |
| **3D viewer** | Blockstates, variants, UV lock, biome tint, animation, comparator |
| **Editor** | Layers, 12+ tools, symmetry, flood-fill worker, copy/paste, undo |
| **Save** | Overwrite / export / namespace / rename, backups, restore |
| **UX** | Command palette, themes, shortcuts, status bar, recent projects |

Full program overview: **[docs/PROJECT.md](docs/PROJECT.md)**

---

## Requirements

- **Node.js** 20+
- **Rust** stable ([rustup](https://rustup.rs))
- **Windows:** WebView2 (bundled by NSIS installer)
- **Linux:** WebKitGTK dev packages to **build** locally; end users can run the **AppImage** without installing dependencies — see [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)

### Download (recommended)

| Platform | Artifact | Install |
|----------|----------|---------|
| **Linux** | `inD3X Art_*_amd64.AppImage` | `chmod +x` → run — [distribution guide](docs/DISTRIBUTION.md) |
| **Windows** | `inD3X Art_*_x64-setup.exe` | NSIS installer from [Releases](https://github.com/ximaks00-hue/ind3x-art/releases) |

---

## Quick start

```powershell
git clone <repo-url>
cd inD3X Art
npm install
npm run tauri dev
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri dev` | Development app (Tauri + Vite HMR) |
| `npm run build` | Typecheck + Vite production build |
| `npm run build:release` | Full Tauri release build |
| `npm run build:appimage` | Linux AppImage only (run on Linux) |
| `npm run build:nsis` | Windows NSIS installer |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI gate) |
| `npm run test:unit` | Vitest unit tests |
| `npm run test` | Rust `cargo test` |
| `npm run test:e2e` | Playwright smoke (Vite, no Tauri) |
| `npm run test:e2e:integration` | Classic + **Block Studio** fixture workflows (mock IPC) |
| `npm run test:e2e:native` | Tauri WebDriver scaffold (optional; set `TAURI_WEBDRIVER_URL`) |
| `npm run clippy` | Rust lint (`-D warnings`) |
| `npm run gen:types` | Regenerate & verify `bindings.ts` (tauri-specta) |
| `npm run ci` | **Full local CI** (mirrors GitHub Actions) |

Testing guide: **[docs/TESTING.md](docs/TESTING.md)**

---

## Project layout

```
src/
  app/                  Orchestration hooks (bootstrap, project, save, hotkeys)
  features/
    catalog/              Block Studio grid, icons, viewport, face nav
    explorer/           Asset tree, fuzzy search, buildTree
    viewer3d/           Three.js scene, buildMesh, UV mapping (lazy-loaded)
    editor/             Pixel editor, layers, tools, textureDocument
    save/               Save dialog, backups, saveTextures
  ipc/                  tauri-specta bindings, spectaClient, e2eMock
src-tauri/src/
  catalog/              Creative catalog build, query, cache, dedup
  index/                Parallel asset indexer + sled cache
  model/                Block models, multipart, mcmeta
  resolve/              Model registry + parent chain
  compile/              Renderable model compilation
  save/                 JAR/folder write, backups, export modes
tests/fixtures/         Sample packs (Rust + E2E)
e2e/                    Playwright smoke + integration/
```

---

## Saving & backups

- **Ctrl+S** — overwrite textures in the open source
- **Save as…** — export folder, namespace, or rename (`Ctrl+Shift+S`)
- JAR backups: `pack.jar.<timestamp>.bak`
- Folder backups: `.ind3x-backups/<timestamp>/…`
- **Backup Manager** — command palette; restore reloads the project

---

## Building installers

**Windows**

```powershell
.\scripts\build-windows.ps1 -Bundles nsis
# → src-tauri\target\release\bundle\nsis\inD3X Art_0.3.1_x64-setup.exe
```

**Linux (AppImage)**

```bash
./scripts/build-linux.sh
# → src-tauri/target/release/bundle/appimage/inD3X Art_0.3.1_amd64.AppImage
```

Full distribution notes: **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)**

Tagged releases (`git tag v0.3.1 && git push origin v0.3.1`) are built automatically by GitHub Actions and uploaded to [Releases](https://github.com/ximaks00-hue/ind3x-art/releases).

### Code signing (optional)

Not configured by default. For production:

1. Obtain an Authenticode certificate (EV recommended for SmartScreen).
2. Set `TAURI_SIGNING_PRIVATE_KEY` and password before `npm run build:release`.
3. See [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/).

### Auto-updater (optional)

Not enabled. To add later: `tauri-plugin-updater`, signed release artifacts, Help menu hook.

---

## Performance

- **3D viewer** is code-split (`ViewerPanelLazy`) — Three.js loads on demand
- `vendor-three` chunk isolates R3F/Three from the main bundle
- Delta texture IPC sends only dirty regions, not full PNGs

---

## Logs

**Command palette → Open log folder**, or check `AppInfo.logDir` from About.

---

## License

Proprietary — inD3X. All rights reserved.

**Maintainer:** [ximaks00-hue](https://github.com/ximaks00-hue) · ximaks00@gmail.com
