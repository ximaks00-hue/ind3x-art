# inD3X Art — Program Overview

> **Premium desktop studio for Minecraft mod and resource-pack authoring.**  
> Open a JAR or folder, browse thousands of assets, preview block models in real-time 3D, paint textures on mesh faces, and write changes back with backups and a save journal.

**Maintainer:** [ximaks00-hue](https://github.com/ximaks00-hue) · ximaks00@gmail.com

---

## Vision

Minecraft content creation still relies on fragmented tools: generic image editors, JSON in VS Code, Blockbench for models, and manual pack management. **inD3X Art** unifies the loop in one native application — index → explore → preview → paint → save — with production-grade performance and a polished UX.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React 19 + TypeScript UI                                       │
│  Explorer · 3D Viewer (R3F/Three.js) · Pixel Editor · Commands  │
├─────────────────────────────────────────────────────────────────┤
│  Zustand stores · IPC client · Vitest · Playwright              │
├─────────────────────────────────────────────────────────────────┤
│  Tauri 2 bridge (invoke + events + binary texture channel)      │
├─────────────────────────────────────────────────────────────────┤
│  Rust core                                                      │
│  index · model/resolve/compile · save · search · image          │
│  sled cache · notify watcher · backups · save journal           │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Responsibility |
|-------|----------------|
| **Indexer** | Parallel scan of JAR/folder; classify assets; sled-backed fingerprint cache; progressive `IndexEvent` stream |
| **Model pipeline** | Parent chains, multipart, legacy UV normalize, blockstate variants, item extrusion |
| **3D compiler** | `RenderableModel` → Three.js meshes; UV lock; biome tint; animation frames |
| **Editor** | Layered textures; pencil/eraser/fill/wand/shapes; symmetry; flood-fill worker; delta IPC |
| **Save** | Overwrite, export, namespace, rename; atomic `save_batch`; automatic backups + restore |

---

## Feature matrix

### Asset workflow
- Open JAR/ZIP mod or resource folder
- Virtualized explorer: Kind / Tree / List views, fuzzy search, facets
- Progressive loading with cache-hit fast path
- Filesystem watcher → auto-reload on external changes

### 3D preview
- Blockstates, variants, display slots (GUI, hand, head…)
- Camera presets (Iso, Front, Top, GUI, Free)
- Paint mode: raycast face → pixel editor slice
- Before/after comparator (split-screen)
- Biome tint selector, animated textures

### Texture editor
- Multi-layer documents with blend modes
- Tools: pencil, eraser, fill, picker, magic wand, line, rect, ellipse, select, move
- Copy/paste regions, undo/redo, symmetry X
- Lighten / darken / dither

### Save & safety
- Ctrl+S overwrite with pre-write backup
- Save as: export folder, namespace remap, rename
- Backup manager + save journal
- Restore last backup → reload project

### UX
- Command palette (Ctrl+K), keyboard shortcuts (?)
- Dark/light theme, UI scale, recent projects
- Status bar: IPC health, index progress, FPS, cursor, zoom

---

## Quality engineering

| Gate | Tool |
|------|------|
| Types | TypeScript strict + `gen:types` (specta drift check) |
| Lint | ESLint 9 (React Hooks, R3F prop allowlist) |
| Format | Prettier |
| Rust | `clippy -D warnings`, 28+ unit tests, indexer benchmarks |
| Frontend unit | Vitest + jsdom (16+ tests, expanding) |
| E2E smoke | Playwright on Vite dev server |
| E2E integration | Fixture pack + mock IPC (`open → paint → save`) |
| CI | GitHub Actions (Windows): full pipeline |

### Bundle strategy
- **Code-split** 3D viewer (`ViewerPanelLazy` → separate chunk)
- **manualChunks** for `three` + `@react-three/*` (`vendor-three`)
- Main bundle stays lean for first paint

---

## Roadmap (tracked)

| Item | Status |
|------|--------|
| Core editor + save | ✅ Shipped |
| CI hardening (lint, format, clippy, tests) | ✅ Shipped |
| Vitest + Playwright scaffold | ✅ Shipped |
| Fixture integration tests | ✅ Shipped |
| Tauri WebDriver (full native E2E) | 📋 Planned |
| Code signing (Authenticode) | 📋 Optional release step |
| Auto-updater (`tauri-plugin-updater`) | 📋 Planned |
| macOS / Linux builds | 📋 Planned |

---

## Tech stack

- **Shell:** Tauri 2, WebView2 (Windows)
- **Backend:** Rust (rayon, sled, zip, image, sha2, notify)
- **Frontend:** React 19, Vite 7, Zustand, TanStack Virtual
- **3D:** Three.js r184, React Three Fiber, Drei
- **Test:** Vitest, Playwright, cargo test

---

## Repository layout

```
src/                    React application
  app/                  App orchestration hooks (bootstrap, project, save)
  features/             explorer, viewer3d, editor, save, settings
  ipc/                  Tauri client + e2e mock
  state/                Zustand stores
src-tauri/src/          Rust core
tests/fixtures/         Sample packs for Rust + E2E
e2e/                    Playwright smoke + integration
docs/                   TESTING.md, PROJECT.md
```

---

## License

Proprietary — inD3X. All rights reserved.
