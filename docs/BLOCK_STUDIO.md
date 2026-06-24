# Block Studio (Creative Catalog)

Premium **Studio** workspace mode in inD3X Art **0.3.x** (introduced in v0.3.0).

## Product goal

Minecraft-like creative inventory: open a pack → grid of block/item icons → click → full 3D model → paint any face → save with backup.

## User scenarios (in scope)

| ID | Scenario | Phase |
|----|----------|-------|
| UC-1 | Quick edit block top face (e.g. grass) | 4 |
| UC-2 | Multipart fence — paint post vs plank | 4 |
| UC-3 | Item icon / sword extrusion + GUI slot | 3–4 |
| UC-4 | 2000+ entries — virtualized grid, lazy icons | 2–3 |

## Out of scope (v1)

- Full vanilla creative tab order / registry
- `catalog_tabs.json` pack overrides (v2)
- Reference Transfer column (deferred)
- Orphan raw textures in catalog grid
- Backend 3D icon bake (frontend Three.js only)

## Architecture

```
Rust catalog/          → build_from_entries, query_catalog
IPC                    → query_catalog, get_catalog_entry
catalogService.ts      → frontend IPC boundary
CatalogIconRenderer    → tier-1 preview thumb, tier-2 WebGL GUI bake
BlockStudioViewport    → Scene3D + FaceRaycaster (Phase 4)
```

### CatalogEntry (API)

See `src-tauri/src/dto.rs` and `src/features/catalog/catalogTypes.ts`.

- **id**: `minecraft:stone`
- **sourcePath**: blockstate or model path
- **resolveKind**: `blockstate` | `model`
- **category**: heuristic tab (`building`, `nature`, …)
- **iconKey**: `{id}:{variant}` for cache

### IPC commands (Phase 0–1)

| Command | Purpose |
|---------|---------|
| `query_catalog` | Paginated search + category filter |
| `get_catalog_entry` | Single entry by id |
| `get_catalog_facets` | Category counts for tab badges |
| `resolve_catalog_entry` | Catalog id → `RenderableModel` (uses default variant) |

Catalog is built on `open_source` / reindex via `catalog::build_project_catalog` (sled cache + texture enrichment).

## Phase 0 deliverables

| Deliverable | Status |
|-------------|--------|
| Rust `catalog/` module | ✅ builder, lang, category, dedup, query |
| Query bench 3000 < 50ms | ✅ `catalog/query.rs` test |
| IPC `query_catalog` | ✅ |
| Icon bake spike 100 < 5s | ✅ tier-1 preview (`catalogIconBake.spike.test.ts`) |
| API types (TS) | ✅ `catalogTypes.ts` |
| Fixture: simple_pack blockstate + lang | ✅ |

## Phase 1 deliverables

| Deliverable | Status |
|-------------|--------|
| `default_variant_key` from blockstate JSON | ✅ |
| `texture_paths` via model resolution | ✅ `catalog/textures.rs` |
| Sled catalog cache (`catalog:v1:{fingerprint}`) | ✅ `catalog/cache.rs` |
| IPC `get_catalog_facets` | ✅ |
| IPC `resolve_catalog_entry` | ✅ |
| Fixture tests: simple_pack, multipart, legacy | ✅ |
| Query bench 200-page < 30ms | ✅ |
| `catalogService` + unit tests | ✅ |

## Phase 2 deliverables

| Deliverable | Status |
|-------------|--------|
| `catalogStore` + `useCatalogQuery` | ✅ |
| `CatalogPanel` virtualized 9×N grid | ✅ |
| `CatalogCell` texture preview fallback | ✅ |
| `CatalogSearch` + category tabs | ✅ |
| `workspaceMode` Classic / Studio toggle | ✅ TitleBar |
| Studio layout: CatalogPanel left | ✅ AppShell |
| Catalog select → viewer (`selectAsset` + variant) | ✅ |
| Keyboard arrows + Enter | ✅ |
| Unit tests | ✅ |

## Phase 3 deliverables

| Deliverable | Status |
|-------------|--------|
| `catalogIconCache` LRU by `iconKey` | ✅ |
| `catalogIconPipeline` tier-1 + tier-2 queue | ✅ |
| Shared WebGL renderer (`bakeCatalogIcon3d`) | ✅ |
| `CatalogIcon` component + item GUI slot frame | ✅ |
| `useCatalogIconPipeline` visible-cell scheduling | ✅ |
| Settings: icon quality + cache limit | ✅ Settings panel |
| Auto: 3D bake default (`auto`/`3d`); tier-1 fallback on timeout | ✅ `catalogIconRules.ts` |
| Unit tests | ✅ |

## Phase 4 deliverables

| Deliverable | Status |
|-------------|--------|
| `BlockStudioViewport` (Scene3D + FaceRaycaster) | ✅ |
| `TextureNavigator` — face/texture chips | ✅ |
| `modelFaceNav` — face list + programmatic select | ✅ |
| Studio auto paint mode + top-face bootstrap (UC-1) | ✅ |
| Multipart face groups (UC-2 fence post/plank) | ✅ |
| Studio toolbar (Orbit/Paint + camera presets) | ✅ |
| Unit tests | ✅ |

## Phase 5 deliverables

| Deliverable | Status |
|-------------|--------|
| Studio onboarding tour (6 steps) | ✅ `STUDIO_ONBOARDING_STEPS` |
| Workspace-aware `OnboardingTour` | ✅ classic + studio completion state |
| Studio tooltip hints | ✅ `TooltipHints` |
| StatusBar: entry · face · texture · Studio badge | ✅ |
| Command palette: workspace switch + restart tour | ✅ |
| Catalog empty-state polish | ✅ |
| `settingsStore` studio onboarding persistence | ✅ |
| Unit tests | ✅ `onboardingSteps.test.ts` |

## Phase 6 deliverables

| Deliverable | Status |
|-------------|--------|
| Catalog query bench 5000 < 50ms | ✅ `catalog/query.rs` |
| Icon LRU byte budget (500 MB) | ✅ `catalogIconCache.ts` |
| Mock catalog 2400+ entries (UC-4) | ✅ `e2eCatalogFixture.ts` |
| Studio E2E: catalog → paint → save | ✅ `studio-workflow.spec.ts` |
| Vitest studio pipeline + scale | ✅ `catalogStudioPipeline.test.ts` |
| Catalog entry warning badges | ✅ `getCatalogEntryWarnings` |
| Native WebDriver studio scaffold | ✅ `e2e/native/studio-webdriver.spec.ts` |
| Docs + TESTING.md | ✅ |

## Phase F deliverables (premium polish)

| Deliverable | Status |
|-------------|--------|
| UV unfold panel (synced with 3D face selection) | ✅ `UnfoldPanel.tsx` |
| Catalog cell micro compare (before/after on hover) | ✅ `CatalogCellCompare.tsx` |
| Animated texture preview in studio toolbar | ✅ `StudioAnimationPreview.tsx` |
| Native WebDriver: demo pack → catalog → unfold | ✅ `studio-webdriver.spec.ts` |
| Reference Transfer (4th column) | ⏸ deferred |

### Phase 0 go/no-go

| Spike | Target | Result |
|-------|--------|--------|
| Catalog query 3000 entries | p95 < 50ms | Run `cargo test bench_query_catalog` |
| Icon bake 100 cells | < 5s | Run `npm run test:unit -- catalogIconBake` |
| 3D icon bake | optional | `bakeCatalogIcon3d` — browser/dev only |

**Decision (updated):** Tier-2 WebGL GUI bake is the default in `auto` mode for all catalog entries (`catalogIconRules.ts`). Tier-1 flat texture preview is **fallback only** (`preview` mode or after 3D bake timeout). See § Icon pipeline below.

### Viewport paint workflow

| Topic | Behavior |
|-------|----------|
| Studio cullface | `studioMode` disables face culling — all multipart faces are pickable |
| Item GUI paint | Hand/Placed views preferred for tools; GUI shows inventory slot transform |
| Texture-only entries | Flat `StudioTexturePreview` + banner — no 3D block model in pack |
| Face bootstrap | Re-runs on catalog entry, **variant**, or **item view** change |
| Live 3D paint | `refreshDirtyTexturesForViewer` before mesh build / resolve cache hit |

## Wireframe — Studio layout

```
┌──────────────────────────────────────────────────────────────┐
│ TitleBar  [Classic | Studio]  Search  Save  Commands         │
├──────────────┬───────────────────────────────┬───────────────┤
│ CatalogGrid  │     BlockStudioViewport       │ EditorPanel   │
│ tabs + 9×N   │     3D + face paint           │ layers/tools  │
│  ~280px      │     TextureNavigator (Ph.4)   │    ~300px     │
├──────────────┴───────────────────────────────┴───────────────┤
│ StatusBar: entry · face · texture · dirty · FPS             │
└──────────────────────────────────────────────────────────────┘
```

Classic mode keeps current Explorer + Viewer layout unchanged.

## Roadmap summary (architecture phases)

| Phase | Focus | Status |
|-------|--------|--------|
| 0 | Discovery — API + spikes | ✅ architecture |
| 1 | Catalog backend hardening + tests | ✅ |
| 2 | Catalog UI grid | ✅ |
| 3 | GUI icon pipeline | ✅ |
| 4 | Block Studio viewport + multi-face UX | ✅ |
| 5 | Polish + onboarding | ✅ |
| 6 | Scale + mock E2E | ⚠️ mock-only; see product waves below |

## Product waves (R1–R6)

Honest acceptance status on **real Tauri + real packs**. Manual checklist: [STUDIO_QA.md](./STUDIO_QA.md).

| Wave | Focus | Priority | Status |
|------|--------|----------|--------|
| R1 | Happy path — errors, debounce, icons, status bar | P0 | ✅ implemented |
| R2 | Catalog UX — fuzzy, recent, focus, facets | P0 | ✅ implemented |
| R3 | Studio viewport — variants, multipart, biome, bootstrap | P0 | ✅ implemented |
| R4 | Icon perf — concurrency, progress, placeholder cube | P1 | ✅ implemented |
| R5 | Real E2E — UI clicks, studio_pack, docs | P1 | ✅ implemented |
| R6 | Premium polish — dirty badge, session restore | P2 | ✅ minimal |

**Note:** Phase 6 Playwright tests use `VITE_E2E_MOCK` (synthetic 2400-entry catalog). Rust `cargo test` exercises real fixtures (`simple_pack`, `multipart_pack`, `studio_pack`).

## Icon pipeline (current behavior)

| Layer | Role |
|-------|------|
| Tier-2 WebGL | Primary path in `auto` / `3d` — `bakeCatalogIcon3d` with inventory camera |
| Tier-1 flat | Fallback after 8s timeout or `preview` mode |
| Memory LRU | `catalogIconCache.ts` — evicted on `invalidateCatalogIconsForTextures` after paint/save |
| Sled cache | Keyed by project fingerprint + `iconKey` — invalidated with same IPC on texture edit |

Known gaps: bake camera is not pixel-perfect vs vanilla; weak GPUs may show letter placeholder after timeout.

## Regenerate bindings

```bash
npm run gen:types
```

Adds `CatalogEntry`, `queryCatalog`, `getCatalogEntry` to `src/ipc/bindings.ts`.
