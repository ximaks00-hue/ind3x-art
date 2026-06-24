import type {
  AppInfo,
  AssetDetails,
  AssetEntry,
  AssetFacets,
  AssetFilter,
  AssetPage,
  AssetWarning,
  BackupInfo,
  IndexEvent,
  ModelRefInfo,
  OpenSourceResult,
  PageReq,
  ProjectHandle,
  RelationshipNode,
  RenderableModel,
  SaveJournalEntry,
  SaveTexturesResult,
  SaveOptions,
  TexturePreview,
  TexturePreviewBatch,
  TextureSaveEntry,
  VariantKey,
  CatalogEntry,
  CatalogFilter,
  CatalogPage,
} from "./types";
import type { Channel } from "@tauri-apps/api/core";
import { buildSyntheticCatalog, E2E_CATALOG_SIZE } from "./e2eCatalogFixture";
import type { WorkspaceMode } from "../state/settingsStore";
import { applyCatalogSelection } from "../features/catalog/catalogSelection";

interface E2EFaultConfig {
  latencyMs: number;
  jitterMs: number;
  failRate: number;
  failOps?: string[];
}

function fixtureFace(direction: string) {
  return {
    direction,
    texture: "assets/minecraft/textures/block/test_stone.png",
    uv: [0, 0, 16, 16] as [number, number, number, number],
    rotation: 0,
    tintindex: 0,
    cullface: null,
  };
}

function emitIndexEvent(onEvent: Channel<IndexEvent>, event: IndexEvent) {
  const channel = onEvent as Channel<IndexEvent> & {
    onmessage?: (event: IndexEvent) => void;
  };
  channel.onmessage?.(event);
}

/** 1×1 red PNG */
const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgMBAp2lAgAAAABJRU5ErkJggg==";

const FIXTURE_ASSETS: AssetEntry[] = [
  {
    id: "assets/minecraft/textures/block/test_stone.png",
    kind: "texture",
    namespace: "minecraft",
    path: "assets/minecraft/textures/block/test_stone.png",
    displayName: "test_stone",
  },
  {
    id: "assets/minecraft/models/block/test_stone.json",
    kind: "blockModel",
    namespace: "minecraft",
    path: "assets/minecraft/models/block/test_stone.json",
    displayName: "test_stone",
  },
  {
    id: "assets/minecraft/blockstates/test_stone.json",
    kind: "blockstate",
    namespace: "minecraft",
    path: "assets/minecraft/blockstates/test_stone.json",
    displayName: "test_stone",
  },
];

function fixtureAssetDetails(entry: AssetEntry): AssetDetails {
  const linkedModels: ModelRefInfo[] =
    entry.kind === "texture"
      ? [
          {
            modelId: "minecraft:block/test_stone",
            path: "assets/minecraft/models/block/test_stone.json",
            kind: "blockModel",
            label: "test_stone",
          },
        ]
      : [];

  const relationships: RelationshipNode[] = linkedModels.map((m) => ({
    id: m.modelId,
    label: m.label,
    kind: m.kind,
    path: m.path,
    children: [],
  }));

  const warnings: AssetWarning[] =
    entry.kind === "texture" && linkedModels.length === 0
      ? [{ code: "orphanTexture", message: "No models reference this texture" }]
      : [];

  return {
    id: entry.id,
    kind: entry.kind,
    path: entry.path,
    namespace: entry.namespace,
    displayName: entry.displayName,
    packFormat: 15,
    textureWidth: entry.kind === "texture" ? 16 : null,
    textureHeight: entry.kind === "texture" ? 16 : null,
    linkedModels,
    relationships,
    warnings,
  };
}

const FIXTURE_RENDERABLE: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/test_stone",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      shade: true,
      rotation: null,
      faces: [
        fixtureFace("north"),
        fixtureFace("south"),
        fixtureFace("east"),
        fixtureFace("west"),
        fixtureFace("up"),
        fixtureFace("down"),
      ],
    },
  ],
  textureRefs: { all: "assets/minecraft/textures/block/test_stone.png" },
  textureMeta: {
    "assets/minecraft/textures/block/test_stone.png": {
      width: 16,
      height: 16,
      animation: null,
    },
  },
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

const FIXTURE_MULTIPART_RENDERABLE: RenderableModel = {
  kind: "multipart",
  modelId: "minecraft:block/fence_post + minecraft:block/fence_side",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [4, 16, 4],
      shade: true,
      rotation: null,
      faces: [
        {
          direction: "up",
          texture: "assets/minecraft/textures/block/oak_fence_post.png",
          uv: [0, 0, 16, 16],
          rotation: 0,
          tintindex: 0,
          cullface: null,
        },
      ],
    },
    {
      from: [0, 0, 0],
      to: [16, 16, 4],
      shade: true,
      rotation: null,
      faces: [
        {
          direction: "north",
          texture: "assets/minecraft/textures/block/oak_fence.png",
          uv: [0, 0, 16, 16],
          rotation: 0,
          tintindex: 0,
          cullface: null,
        },
      ],
    },
  ],
  textureRefs: {},
  textureMeta: {
    "assets/minecraft/textures/block/oak_fence_post.png": {
      width: 16,
      height: 16,
      animation: null,
    },
    "assets/minecraft/textures/block/oak_fence.png": {
      width: 16,
      height: 16,
      animation: null,
    },
  },
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

export interface E2EApi {
  openFixture: () => Promise<void>;
  openStudioFixture: () => Promise<void>;
  setWorkspaceMode: (mode: WorkspaceMode) => Promise<void>;
  selectCatalogEntry: (entryId: string) => Promise<void>;
  getCatalogTotal: () => Promise<number>;
  paintTestPixel: () => Promise<void>;
  paintTestFill: () => Promise<void>;
  setFaceShapeDraft: () => Promise<void>;
  getFaceShapeDraft: () => Promise<{
    cuboidIndex: number;
    faceIndex: number;
    texturePath: string;
    start: [number, number];
    end: [number, number];
  } | null>;
  getSavedTextures: () => TextureSaveEntry[];
  getStudioModelId: () => Promise<string | null>;
  getCatalogSelectedId: () => Promise<string | null>;
  setFaultConfig: (config: Partial<E2EFaultConfig>) => void;
  clearFaultConfig: () => void;
  isFixtureOpen: () => boolean;
}

declare global {
  interface Window {
    __E2E__?: E2EApi;
    __E2E_FAULTS__?: Partial<E2EFaultConfig>;
  }
}

function parseStoredE2EFaultConfig(raw: string): Partial<E2EFaultConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const record = parsed as Record<string, unknown>;
  const result: Partial<E2EFaultConfig> = {};
  if (typeof record.latencyMs === "number" && Number.isFinite(record.latencyMs)) {
    result.latencyMs = record.latencyMs;
  }
  if (typeof record.jitterMs === "number" && Number.isFinite(record.jitterMs)) {
    result.jitterMs = record.jitterMs;
  }
  if (typeof record.failRate === "number" && Number.isFinite(record.failRate)) {
    result.failRate = record.failRate;
  }
  if (Array.isArray(record.failOps)) {
    result.failOps = record.failOps.filter(
      (op): op is string => typeof op === "string" && op.length > 0,
    );
  }
  return result;
}

function readFaultConfig(): E2EFaultConfig {
  const defaults: E2EFaultConfig = {
    latencyMs: Number(import.meta.env.VITE_E2E_MOCK_LATENCY_MS ?? 0) || 0,
    jitterMs: Number(import.meta.env.VITE_E2E_MOCK_JITTER_MS ?? 0) || 0,
    failRate: Number(import.meta.env.VITE_E2E_MOCK_FAIL_RATE ?? 0) || 0,
  };
  if (typeof window === "undefined") return defaults;
  const fromWindow = window.__E2E_FAULTS__ ?? {};
  const fromStorageRaw = window.localStorage?.getItem("ind3x:e2e-faults");
  let fromStorage: Partial<E2EFaultConfig> = {};
  if (fromStorageRaw) {
    fromStorage = parseStoredE2EFaultConfig(fromStorageRaw);
  }
  const failOps = fromWindow.failOps ?? fromStorage.failOps;
  return {
    latencyMs: Math.max(
      0,
      Number(fromWindow.latencyMs ?? fromStorage.latencyMs ?? defaults.latencyMs) || 0,
    ),
    jitterMs: Math.max(
      0,
      Number(fromWindow.jitterMs ?? fromStorage.jitterMs ?? defaults.jitterMs) || 0,
    ),
    failRate: Math.min(
      1,
      Math.max(
        0,
        Number(fromWindow.failRate ?? fromStorage.failRate ?? defaults.failRate) || 0,
      ),
    ),
    ...(failOps && failOps.length > 0 ? { failOps } : {}),
  };
}

async function applyFaultPoint(opName: string): Promise<void> {
  const fault = readFaultConfig();
  if (fault.latencyMs > 0 || fault.jitterMs > 0) {
    const jitter = fault.jitterMs > 0 ? Math.floor(Math.random() * fault.jitterMs) : 0;
    const wait = fault.latencyMs + jitter;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  if (fault.failOps?.includes(opName)) {
    throw new Error(`E2E mock injected failure at ${opName}`);
  }
  if (fault.failRate > 0 && Math.random() < fault.failRate) {
    throw new Error(`E2E mock injected failure at ${opName}`);
  }
}

export function createE2eMockIpc() {
  let handleSeq = 1;
  let currentHandle: ProjectHandle | null = null;
  let savedTextures: TextureSaveEntry[] = [];
  const mockCatalog = buildSyntheticCatalog(E2E_CATALOG_SIZE);
  const catalogById = new Map(mockCatalog.map((entry) => [entry.id, entry]));

  const appInfo: AppInfo = {
    name: "inD3X Art",
    version: "0.3.2-e2e",
    identifier: "com.ind3x.art",
    target: "e2e-mock",
    profile: "test",
    logDir: "/tmp/ind3x-art-e2e",
  };

  async function openFixtureProject() {
    const { useProjectStore } = await import("../state/projectStore");
    const handle: ProjectHandle = { id: handleSeq++ };
    currentHandle = handle;

    const result: OpenSourceResult = {
      handle,
      sourcePath: "tests/fixtures/simple_pack",
      sourceKind: "folder",
      entryCount: FIXTURE_ASSETS.length,
      fromCache: false,
      catalogFromCache: false,
      catalogEntryCount: E2E_CATALOG_SIZE,
      packFormat: 15,
      catalogLanguage: "en_us",
    };

    useProjectStore.getState().finishOpen(result);
    useProjectStore
      .getState()
      .setQueryPage(FIXTURE_ASSETS, FIXTURE_ASSETS.length, false, 0);
    useProjectStore.getState().setIndexStatus("done");
    useProjectStore.getState().setIndexProgress(100, 100, "fixture");
    const { bumpProjectDataRevision } = await import("../app/projectDataRevision");
    bumpProjectDataRevision();
  }

  async function setWorkspaceMode(mode: WorkspaceMode) {
    const { useSettingsStore } = await import("../state/settingsStore");
    useSettingsStore.getState().setWorkspaceMode(mode);
  }

  async function openStudioFixture() {
    await openFixtureProject();
    await setWorkspaceMode("studio");
  }

  async function selectCatalogEntry(entryId: string) {
    const entry = catalogById.get(entryId);
    if (!entry) throw new Error(`Catalog entry not found: ${entryId}`);
    applyCatalogSelection(entry);
  }

  async function getCatalogTotal() {
    if (!currentHandle) return 0;
    const page = await queryCatalogMock(
      { category: null, namespace: null, search: null, fuzzy: false },
      { offset: 0, limit: 1 },
    );
    return page.total;
  }

  function queryCatalogMock(filter: CatalogFilter, page: PageReq): CatalogPage {
    let entries = mockCatalog;
    if (filter.category) {
      entries = entries.filter((e) => e.category === filter.category);
    }
    if (filter.namespace) {
      entries = entries.filter((e) => e.namespace === filter.namespace);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.searchTokens.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const slice = entries.slice(page.offset, page.offset + page.limit);
    return { entries: slice, total: entries.length };
  }

  async function paintTestPixel() {
    const path = "assets/minecraft/textures/block/test_stone.png";
    const { ensureTextureDocument, commitChanges, getPixel } =
      await import("../features/editor/textureDocument");
    const handle: ProjectHandle = currentHandle ?? { id: 1 };
    const doc = await ensureTextureDocument(handle, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);
  }

  async function paintTestFill() {
    const path = "assets/minecraft/textures/block/test_stone.png";
    const { buildPaintStrokeContext, paintAtTexturePixel } =
      await import("../features/editor/paintInteraction");
    const { useEditorStore } = await import("../state/editorStore");
    useEditorStore.setState({ tool: "fill", color: "#00ff00", fillTolerance: 0 });
    const handle: ProjectHandle = currentHandle ?? { id: 1 };
    const ctx = buildPaintStrokeContext(handle, path);
    await paintAtTexturePixel(ctx, 0, 0, false, null, { pixelWorker: null });
  }

  function setFaceShapeDraft() {
    const path = "assets/minecraft/textures/block/test_stone.png";
    return import("../state/editorStore").then(({ useEditorStore }) => {
      useEditorStore.setState({
        tool: "rect",
        faceShapeDraft: {
          cuboidIndex: 0,
          faceIndex: 0,
          texturePath: path,
          start: [0, 0],
          end: [8, 8],
        },
      });
    });
  }

  function getFaceShapeDraft() {
    return import("../state/editorStore").then(({ useEditorStore }) => {
      return useEditorStore.getState().faceShapeDraft;
    });
  }

  function setFaultConfig(config: Partial<E2EFaultConfig>) {
    if (typeof window === "undefined") return;
    window.__E2E_FAULTS__ = { ...window.__E2E_FAULTS__, ...config };
  }

  function clearFaultConfig() {
    if (typeof window === "undefined") return;
    delete window.__E2E_FAULTS__;
    window.localStorage?.removeItem("ind3x:e2e-faults");
  }

  const e2eMockEnabled =
    import.meta.env.VITE_E2E_MOCK === "true" &&
    !import.meta.env.PROD &&
    (import.meta.env.DEV || import.meta.env.MODE === "test");

  if (typeof window !== "undefined" && e2eMockEnabled) {
    window.__E2E__ = {
      openFixture: openFixtureProject,
      openStudioFixture,
      setWorkspaceMode,
      selectCatalogEntry,
      getCatalogTotal,
      paintTestPixel,
      paintTestFill,
      setFaceShapeDraft,
      getFaceShapeDraft,
      getSavedTextures: () => [...savedTextures],
      getStudioModelId: async () => {
        const { useViewerStore } = await import("../state/viewerStore");
        return useViewerStore.getState().currentRenderable?.modelId ?? null;
      },
      getCatalogSelectedId: async () => {
        const { useCatalogStore } = await import("../features/catalog/catalogStore");
        return useCatalogStore.getState().selectedId;
      },
      setFaultConfig,
      clearFaultConfig,
      isFixtureOpen: () => currentHandle !== null,
    };
  }

  return {
    getAppInfo: async () => appInfo,
    getSamplePackPath: async () => "tests/fixtures/simple_pack",
    readRecentLogs: async (maxLines?: number) => ({
      logDir: "tests/fixtures/logs",
      file: "ind3x-art.log",
      lines: [
        "2026-06-23T10:00:00Z INFO ind3x_art: inD3X Art starting",
        "2026-06-23T10:00:01Z INFO ind3x_art: mock IPC active (E2E)",
        ...(maxLines && maxLines < 2
          ? []
          : ["2026-06-23T10:00:02Z DEBUG ind3x_art: index ready"]),
      ].slice(0, maxLines ?? 200),
    }),
    revealLogDir: async () => undefined,
    ping: async () => "pong" as const,
    openSource: async (path: string, onEvent: Channel<IndexEvent>) => {
      await applyFaultPoint("openSource");
      const handle: ProjectHandle = { id: handleSeq++ };
      currentHandle = handle;
      emitIndexEvent(onEvent, { type: "started", total: FIXTURE_ASSETS.length });
      for (const entry of FIXTURE_ASSETS) {
        emitIndexEvent(onEvent, { type: "asset", entry });
      }
      emitIndexEvent(onEvent, { type: "done", durationMs: 0, fromCache: false });
      return {
        handle,
        sourcePath: path,
        sourceKind: "folder" as const,
        entryCount: FIXTURE_ASSETS.length,
        fromCache: false,
        catalogFromCache: false,
        catalogEntryCount: E2E_CATALOG_SIZE,
        packFormat: 15,
        catalogLanguage: "en_us",
      };
    },
    closeSource: async () => {
      currentHandle = null;
    },
    cancelIndex: async () => undefined,
    queryAssets: async (
      _handle: ProjectHandle,
      filter: AssetFilter,
      page: PageReq,
    ): Promise<AssetPage> => {
      await applyFaultPoint("queryAssets");
      let entries = FIXTURE_ASSETS;
      if (filter.kind) entries = entries.filter((e) => e.kind === filter.kind);
      if (filter.namespace) {
        entries = entries.filter((e) => e.namespace === filter.namespace);
      }
      const slice = entries.slice(page.offset, page.offset + page.limit);
      return { entries: slice, total: entries.length };
    },
    getAssetFacets: async (): Promise<AssetFacets> => ({
      byNamespace: [{ key: "minecraft", count: FIXTURE_ASSETS.length }],
      byKind: [
        { key: "texture", count: 1 },
        { key: "blockModel", count: 1 },
        { key: "blockstate", count: 1 },
      ],
    }),
    queryCatalog: async (
      _handle: ProjectHandle,
      filter: CatalogFilter,
      page: PageReq,
    ): Promise<CatalogPage> => {
      await applyFaultPoint("queryCatalog");
      return queryCatalogMock(filter, page);
    },
    getCatalogEntry: async (
      _handle: ProjectHandle,
      entryId: string,
    ): Promise<CatalogEntry> => {
      const entry = catalogById.get(entryId);
      if (!entry) throw new Error(`Catalog entry not found: ${entryId}`);
      return entry;
    },
    getCatalogFacets: async (): Promise<{
      byCategory: { key: string; count: number }[];
    }> => {
      const counts = new Map<string, number>();
      for (const entry of mockCatalog) {
        counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
      }
      return {
        byCategory: [...counts.entries()].map(([key, count]) => ({ key, count })),
      };
    },
    resolveCatalogEntry: async (
      _handle: ProjectHandle,
      entryId: string,
      _context?: string,
      variantKey?: string | null,
    ) => {
      if (entryId === "minecraft:broken_block") {
        throw new Error("Missing parent model: minecraft:block/missing_parent");
      }
      if (entryId === "minecraft:test_fence_multipart") {
        return FIXTURE_MULTIPART_RENDERABLE;
      }
      if (entryId === "minecraft:test_fence_variant") {
        return {
          ...FIXTURE_RENDERABLE,
          modelId: `minecraft:block/oak_fence:${variantKey ?? "default"}`,
        };
      }
      return FIXTURE_RENDERABLE;
    },
    rebuildProjectCatalog: async () => undefined,
    getProjectFingerprint: async () => "e2e-fingerprint",
    getCatalogIconCache: async () => null,
    setCatalogIconCache: async () => undefined,
    invalidateCatalogIconsForTextures: async () => [],
    getAssetEntry: async (
      _handle: ProjectHandle,
      assetId: string,
    ): Promise<AssetEntry> => {
      const entry = FIXTURE_ASSETS.find((e) => e.id === assetId);
      if (!entry) throw new Error(`Asset not found: ${assetId}`);
      return entry;
    },
    getAssetDetails: async (
      _handle: ProjectHandle,
      assetId: string,
    ): Promise<AssetDetails> => {
      const entry = FIXTURE_ASSETS.find((e) => e.id === assetId);
      if (!entry) throw new Error(`Asset not found: ${assetId}`);
      return fixtureAssetDetails(entry);
    },
    revealAssetInFolder: async () => undefined,
    getTexturePreviewsBatch: async (
      _handle: ProjectHandle,
      assetPaths: string[],
    ): Promise<TexturePreviewBatch[]> => {
      await applyFaultPoint("getTexturePreviewsBatch");
      return assetPaths.map((path) => ({
        path,
        preview: {
          pngBase64: RED_PNG_BASE64,
          width: 16,
          height: 16,
        },
      }));
    },
    getTexturePreview: async (): Promise<TexturePreview> => ({
      pngBase64: RED_PNG_BASE64,
      width: 16,
      height: 16,
    }),
    getTexture: async (): Promise<TexturePreview> => ({
      pngBase64: RED_PNG_BASE64,
      width: 16,
      height: 16,
    }),
    listVariants: async (): Promise<VariantKey[]> => [],
    modelsForTexture: async (): Promise<ModelRefInfo[]> => [
      {
        modelId: "minecraft:block/test_stone",
        path: "assets/minecraft/models/block/test_stone.json",
        kind: "blockModel",
        label: "test_stone",
      },
    ],
    resolveRenderable: async (): Promise<RenderableModel> => FIXTURE_RENDERABLE,
    saveTextures: async (
      _handle: ProjectHandle,
      textures: TextureSaveEntry[],
      _options?: SaveOptions,
    ): Promise<SaveTexturesResult> => {
      await applyFaultPoint("saveTextures");
      savedTextures = textures;
      const paths = textures.map((t) => t.path);
      return {
        savedCount: textures.length,
        savedPaths: paths,
        originalPaths: paths,
        backupPath: "tests/fixtures/simple_pack/.ind3x-backups/e2e-mock",
      };
    },
    saveBatch: async (
      _handle: ProjectHandle,
      textures: TextureSaveEntry[],
      _options?: SaveOptions,
    ): Promise<SaveTexturesResult> => {
      await applyFaultPoint("saveBatch");
      savedTextures = textures;
      const paths = textures.map((t) => t.path);
      return {
        savedCount: textures.length,
        savedPaths: paths,
        originalPaths: paths,
        backupPath: "tests/fixtures/simple_pack/.ind3x-backups/e2e-mock",
      };
    },
    getSaveJournal: async (): Promise<SaveJournalEntry[]> => [],
    getTextureBinary: async () =>
      Uint8Array.from(atob(RED_PNG_BASE64), (c) => c.charCodeAt(0)),
    saveTextureMcmeta: async () => undefined,
    listProjectBackups: async (): Promise<BackupInfo[]> => [],
    restoreProjectBackup: async () => undefined,
    restoreProjectBackupById: async () => undefined,
    createProjectBackup: async (): Promise<BackupInfo> => ({
      id: "e2e-backup",
      path: "tests/fixtures/simple_pack/.ind3x-backups/e2e",
      label: "E2E backup",
      createdAt: Math.floor(Date.now() / 1000),
      kind: "folder",
    }),
    reindexProject: async () => {
      await applyFaultPoint("reindexProject");
      return { assetCount: FIXTURE_ASSETS.length, catalogCount: E2E_CATALOG_SIZE };
    },
    invalidateProjectIndex: async () => undefined,
    rollbackLastSave: async () => undefined,
    onSourceChanged: async () => () => undefined,
    onCacheInvalidated: async () => () => undefined,
  };
}
