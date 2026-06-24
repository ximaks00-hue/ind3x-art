# Block Studio — manual QA checklist

Run on **real Tauri** (`npm run tauri dev`), not mock/Vitest. Fixture: `tests/fixtures/simple_pack` or demo pack.

## R1 — Happy path (P0)

| # | Step | Expected |
|---|------|----------|
| 1 | Open app → switch **Studio** in title bar | Left panel shows **Catalog** |
| 2 | Open folder → `tests/fixtures/simple_pack` | Index completes; catalog total ≥ 1 in status bar |
| 3 | Grid shows **Test Stone** | Icon is texture/shimmer, not only letter `T` |
| 4 | Click **Test Stone** | 3D viewport loads block model |
| 5 | Paint mode active, **Top** face selected | Texture navigator shows top chip |
| 6 | Paint one pixel on canvas | Dirty count ≥ 1 |
| 7 | **Ctrl+S** | Save succeeds; toast or status flash |
| 8 | Open backup manager | Backup entry exists for saved texture |
| 9 | Search `stone` while typing fast | No false **No matches** during debounce |
| 10 | Toggle **Classic** | Explorer works; no Studio regression |

## R2 — Catalog UX

| # | Step | Expected |
|---|------|----------|
| 1 | Enable **Fuzzy** in catalog search | Search `stne` finds stone-like entries |
| 2 | Pick 3 different blocks | **Recent** row shows last picks (up to 8) |
| 3 | Category tabs | Counts visible when facets load |
| 4 | Disconnect IPC / force catalog error | Inline error + **Retry**, toast |

## R3 — Viewport

| # | Step | Expected |
|---|------|----------|
| 1 | Block with variants | Variant dropdown in studio toolbar |
| 2 | Switch to **Orbit**, select another face | Stays in Orbit (no forced Paint) |
| 3 | `multipart_pack` fence | Post vs plank chips differ |
| 4 | Failed resolve | Studio error + Retry + Open in Classic |
| 5 | Biome presets | Grass/snow tint visible on grass-like blocks |

## R4 — Icons

| # | Step | Expected |
|---|------|----------|
| 1 | Scroll large catalog | Icons appear < 200 ms p95 (cached < 50 ms) |
| 2 | > 50 pending bakes | Header shows **Baking icons…** |
| 3 | Block without texture | Cube placeholder, not `?` |

## R5 — E2E / CI

| # | Check | Expected |
|---|-------|----------|
| 1 | `npm run test:e2e:integration` | Studio workflow green (UI click path) |
| 2 | `cargo test` catalog fixtures | simple_pack, multipart_pack pass |
| 3 | Classic `fixture-workflow` | Unchanged after Studio changes |

## Per-wave sign-off

- [ ] R1 signed off on real Tauri
- [ ] R2 signed off
- [ ] R3 signed off
- [ ] R4 signed off
- [ ] R5 CI green
