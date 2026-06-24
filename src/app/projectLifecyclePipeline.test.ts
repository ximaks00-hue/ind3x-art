import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssetDetails,
  AssetEntry,
  IndexEvent,
  RenderableModel,
  TextureSaveEntry,
} from "../ipc/types";

const TEXTURE_PATH = "assets/minecraft/textures/block/test_stone.png";

const FIXTURE_ASSETS: AssetEntry[] = [
  {
    id: TEXTURE_PATH,
    kind: "texture",
    namespace: "minecraft",
    path: TEXTURE_PATH,
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
  cuboids: [],
  textureRefs: { all: TEXTURE_PATH },
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

function fixtureAssetDetails(entry: AssetEntry): AssetDetails {
  return {
    id: entry.id,
    kind: entry.kind,
    path: entry.path,
    namespace: entry.namespace,
    displayName: entry.displayName,
    packFormat: 15,
    textureWidth: entry.kind === "texture" ? 16 : null,
    textureHeight: entry.kind === "texture" ? 16 : null,
    linkedModels:
      entry.kind === "texture"
        ? [
            {
              modelId: "minecraft:block/test_stone",
              path: "assets/minecraft/models/block/test_stone.json",
              kind: "blockModel",
              label: "test_stone",
            },
          ]
        : [],
    relationships: [],
    warnings: [],
  };
}

const ipcMock = vi.hoisted(() => ({
  openSource: vi.fn(),
  queryAssets: vi.fn(),
  getAssetDetails: vi.fn(),
  resolveRenderable: vi.fn(),
  getTexture: vi.fn(),
  saveBatch: vi.fn(),
  invalidateCatalogIconsForTextures: vi.fn(),
}));

vi.mock("../ipc/client", () => ({
  ipc: ipcMock,
  IpcError: class IpcError extends Error {},
  isCoreError: () => false,
}));

vi.mock("../features/viewer3d/textureLoader", () => ({
  refreshTextureFromCanvas: vi.fn(),
  clearTextureCache: vi.fn(),
}));

import { queryAssets } from "./services/assetService";
import { getAssetDetails } from "./services/explorerService";
import { ipc } from "../ipc/client";
import {
  clearTextureDocuments,
  commitChanges,
  ensureTextureDocument,
  getPixel,
  isTextureDirty,
} from "../features/editor/textureDocument";
import { saveDirtyTextures } from "../features/save/saveTextures";
import { useProjectStore } from "../state/projectStore";

function make1x1PngBase64(r: number, g: number, b: number, a = 255): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png").split(",")[1]!;
}

async function openFixtureProject() {
  const onEvent = { onmessage: null as ((event: IndexEvent) => void) | null };
  const result = await ipc.openSource("tests/fixtures/simple_pack", onEvent as never);
  useProjectStore.getState().setHandle(result);
  useProjectStore.getState().finishOpen(result);
  useProjectStore.getState().setIndexStatus("done");
  useProjectStore.getState().bumpQueryRevision();
  return result;
}

describe("project lifecycle pipeline", () => {
  beforeEach(() => {
    clearTextureDocuments();
    useProjectStore.setState({
      handle: null,
      sourcePath: null,
      sourceKind: null,
      assets: [],
      assetTotal: 0,
      selectedAsset: null,
      selectedAssetId: null,
      indexStatus: "idle",
      queryRevision: 0,
    });
    vi.clearAllMocks();

    ipcMock.openSource.mockResolvedValue({
      handle: { id: 1 },
      sourcePath: "tests/fixtures/simple_pack",
      sourceKind: "folder",
      entryCount: FIXTURE_ASSETS.length,
      fromCache: false,
      catalogFromCache: false,
      catalogEntryCount: 0,
      packFormat: 15,
      catalogLanguage: "en_us",
    });
    ipcMock.queryAssets.mockImplementation(async (_handle, filter, page) => {
      let entries = FIXTURE_ASSETS;
      if (filter.kind) entries = entries.filter((entry) => entry.kind === filter.kind);
      const slice = entries.slice(page.offset, page.offset + page.limit);
      return { entries: slice, total: entries.length };
    });
    ipcMock.getAssetDetails.mockImplementation(async (_handle, assetId) => {
      const entry = FIXTURE_ASSETS.find((row) => row.id === assetId);
      if (!entry) throw new Error(`Asset not found: ${assetId}`);
      return fixtureAssetDetails(entry);
    });
    ipcMock.resolveRenderable.mockResolvedValue(FIXTURE_RENDERABLE);
    ipcMock.getTexture.mockResolvedValue({
      pngBase64: make1x1PngBase64(255, 0, 0),
      width: 1,
      height: 1,
    });
    ipcMock.saveBatch.mockImplementation(
      async (_handle, textures: TextureSaveEntry[]) => {
        const paths = textures.map((texture) => texture.path);
        return {
          savedCount: textures.length,
          savedPaths: paths,
          originalPaths: paths,
          backupPath: "tests/fixtures/simple_pack/.ind3x-backups/e2e-mock",
        };
      },
    );
    ipcMock.invalidateCatalogIconsForTextures.mockResolvedValue([]);
  });

  it("open -> query textures -> inspect -> resolve renderable", async () => {
    const { handle } = await openFixtureProject();

    const page = await queryAssets(
      handle,
      { kind: "texture", namespace: null, search: null, fuzzy: false },
      { offset: 0, limit: 50 },
    );
    expect(page.total).toBe(1);
    expect(page.entries[0]?.path).toBe(TEXTURE_PATH);

    useProjectStore.getState().selectAsset(page.entries[0]!);
    expect(useProjectStore.getState().selectedAsset?.kind).toBe("texture");

    const details = await getAssetDetails(handle, page.entries[0]!.id);
    expect(details.linkedModels).toHaveLength(1);

    const renderable = await ipc.resolveRenderable(
      handle,
      page.entries[0]!.path,
      undefined,
      undefined,
    );
    expect(renderable.modelId).toBe("minecraft:block/test_stone");
    expect(renderable.textureRefs.all).toBe(TEXTURE_PATH);
  });

  it("open -> paint texture -> save clears dirty through mock IPC", async () => {
    const { handle } = await openFixtureProject();

    const doc = await ensureTextureDocument(handle, TEXTURE_PATH);
    const before = getPixel(TEXTURE_PATH, 0, 0)!;
    commitChanges(handle, TEXTURE_PATH, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);

    expect(isTextureDirty(TEXTURE_PATH)).toBe(true);

    const result = await saveDirtyTextures(handle, { mode: "overwrite" });
    expect(result.savedCount).toBe(1);
    expect(result.originalPaths).toContain(TEXTURE_PATH);
    expect(isTextureDirty(TEXTURE_PATH)).toBe(false);
    expect(getPixel(TEXTURE_PATH, 0, 0)).toEqual([0, 255, 0, 255]);
  });
});
