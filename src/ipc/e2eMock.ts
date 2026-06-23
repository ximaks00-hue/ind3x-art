import type {
  AppInfo,
  AssetEntry,
  AssetFacets,
  AssetFilter,
  AssetPage,
  BackupInfo,
  IndexEvent,
  ModelRefInfo,
  OpenSourceResult,
  PageReq,
  ProjectHandle,
  RenderableModel,
  SaveJournalEntry,
  SaveTexturesResult,
  SaveOptions,
  TexturePreview,
  TextureSaveEntry,
  VariantKey,
} from "./types";
import type { Channel } from "@tauri-apps/api/core";

function fixtureFace(direction: string) {
  return {
    direction,
    texture: "assets/minecraft/textures/block/test_stone.png",
    uv: [0, 0, 16, 16] as [number, number, number, number],
    rotation: 0,
    tintindex: 0,
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

const FIXTURE_RENDERABLE: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/test_stone",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      shade: true,
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
    },
  },
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

export interface E2EApi {
  openFixture: () => Promise<void>;
  paintTestPixel: () => Promise<void>;
  getSavedTextures: () => TextureSaveEntry[];
  isFixtureOpen: () => boolean;
}

declare global {
  interface Window {
    __E2E__?: E2EApi;
  }
}

export function createE2eMockIpc() {
  let handleSeq = 1;
  let currentHandle: ProjectHandle | null = null;
  let savedTextures: TextureSaveEntry[] = [];

  const appInfo: AppInfo = {
    name: "inD3X Art",
    version: "0.1.0-e2e",
    identifier: "art.ind3x.app",
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
    };

    useProjectStore.getState().setProject(result, FIXTURE_ASSETS);
    useProjectStore.getState().setIndexStatus("done");
    useProjectStore.getState().setIndexProgress(100, 100, "fixture");
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

  if (typeof window !== "undefined") {
    window.__E2E__ = {
      openFixture: openFixtureProject,
      paintTestPixel,
      getSavedTextures: () => [...savedTextures],
      isFixtureOpen: () => currentHandle !== null,
    };
  }

  return {
    getAppInfo: async () => appInfo,
    revealLogDir: async () => undefined,
    ping: async () => "pong" as const,
    openSource: async (path: string, onEvent: Channel<IndexEvent>) => {
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
    streamDemo: async () => undefined,
    onSourceChanged: async () => () => undefined,
    onCacheInvalidated: async () => () => undefined,
  };
}
