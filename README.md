# inD3X Art

**Premium desktop studio for Minecraft mods and resource packs.**

Open a JAR or folder, browse assets with fuzzy search, preview block models in real-time 3D, paint textures on mesh faces, and save changes back to the source — with automatic backups and a save journal.

**Stack:** Tauri 2 · Rust · React 19 · TypeScript · Three.js · Vitest · Playwright

[![CI](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/ci.yml/badge.svg)](https://github.com/ximaks00-hue/ind3x-art/actions/workflows/ci.yml)

**Author:** [ximaks00-hue](https://github.com/ximaks00-hue) · [ximaks00@gmail.com](mailto:ximaks00@gmail.com)

---

## Highlights

| Area | What you get |
|------|----------------|
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
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI gate) |
| `npm run test:unit` | Vitest unit tests |
| `npm run test` | Rust `cargo test` |
| `npm run test:e2e` | Playwright smoke (Vite, no Tauri) |
| `npm run test:e2e:integration` | Fixture open → paint → save (mock IPC) |
| `npm run clippy` | Rust lint (`-D warnings`) |
| `npm run gen:types` | Verify Rust→TS type export |
| `npm run ci` | **Full local CI** (mirrors GitHub Actions) |

Testing guide: **[docs/TESTING.md](docs/TESTING.md)**

---

## Project layout

```
src/
  app/                  Orchestration hooks (bootstrap, project, save, hotkeys)
  features/
    explorer/           Asset tree, fuzzy search, buildTree
    viewer3d/           Three.js scene, buildMesh, UV mapping (lazy-loaded)
    editor/             Pixel editor, layers, tools, textureDocument
    save/               Save dialog, backups, saveTextures
  ipc/                  Tauri client, e2eMock for integration tests
src-tauri/src/
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

```powershell
.\scripts\build-windows.ps1 -Bundles nsis
# → src-tauri\target\release\bundle\nsis\inD3X Art_0.1.0_x64-setup.exe
```

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
