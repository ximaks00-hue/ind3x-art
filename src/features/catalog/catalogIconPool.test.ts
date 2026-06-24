import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import {
  catalogIconCacheKey,
  getCatalogIconCache,
  resetCatalogIconCache,
} from "./catalogIconCache";
import {
  cancelInvisibleIconBakes,
  getCatalogIconQueueDepth,
  resetCatalogIconPipeline,
  scheduleCatalogIconBakes,
  scheduleCatalogIconBakesFlat,
} from "./catalogIconPipeline";

function sampleEntry(index: number): CatalogEntry {
  const stem = `block_${index}`;
  const path = `assets/minecraft/blockstates/${stem}.json`;
  return {
    id: `minecraft:${stem}`,
    namespace: "minecraft",
    displayName: `Block ${index}`,
    kind: "block",
    sourcePath: path,
    resolveKind: "blockstate",
    category: "building",
    searchTokens: [],
    texturePaths: [`assets/minecraft/textures/block/${stem}.png`],
    iconKey: `minecraft:${stem}:`,
    aliases: [],
    studioModelPath: path,
    presentation: "block",
  };
}

const stubModel = {
  kind: "itemModel",
  cuboids: [{ from: [0, 0, 0], to: [16, 16, 16], faces: [], shade: true, rotation: null }],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: { gui: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] } },
  ambientOcclusion: true,
  modelId: "test",
};

const resolveMock = vi.hoisted(() => vi.fn());
const bake3dMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/services/catalogService", () => ({
  resolveCatalogEntry: resolveMock,
  getCatalogIconCache: vi.fn().mockResolvedValue(null),
  setCatalogIconCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../app/services/textureService", () => ({
  getTexturePreview: vi.fn(),
}));

vi.mock("./CatalogIconRenderer", () => ({
  bakeCatalogIcon3d: bake3dMock,
  bakeCatalogIconFromPreviewAsync: vi.fn(),
  disposeCatalogIconRenderer: vi.fn(),
}));

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function drainIconQueue(timeoutMs = 500): Promise<void> {
  await vi.waitFor(() => expect(getCatalogIconQueueDepth()).toBe(0), { timeout: timeoutMs });
}

describe("catalog icon bake pool perf", () => {
  beforeEach(async () => {
    resetCatalogIconCache();
    resetCatalogIconPipeline();
    vi.clearAllMocks();
    resolveMock.mockResolvedValue(stubModel);
    bake3dMock.mockResolvedValue("data:image/png;base64,AAAA");
    await drainIconQueue();
  });

  it("cache hit for 200 icons completes quickly", () => {
    const handle = { id: 42 };
    const limit = 512;
    const entries = Array.from({ length: 200 }, (_, i) => sampleEntry(i));
    const cache = getCatalogIconCache(limit);
    for (const entry of entries) {
      const key = catalogIconCacheKey(handle.id, entry.iconKey);
      cache.set(key, { url: "data:image/png;base64,cached", tier: 2 });
    }

    const start = performance.now();
    for (const entry of entries) {
      const key = catalogIconCacheKey(handle.id, entry.iconKey);
      expect(cache.get(key)?.tier).toBe(2);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("schedules 200 new icon bakes without throwing", async () => {
    const entries = Array.from({ length: 200 }, (_, i) => sampleEntry(i + 1000));
    const start = performance.now();
    scheduleCatalogIconBakesFlat(entries, { id: 1 }, "3d", 512, 512);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
    await drainIconQueue(15_000);
  });
});

describe("catalog icon bake pool behavior", () => {
  beforeEach(async () => {
    resetCatalogIconCache();
    resetCatalogIconPipeline();
    vi.clearAllMocks();
    resolveMock.mockResolvedValue(stubModel);
    bake3dMock.mockResolvedValue("data:image/png;base64,AAAA");
    await drainIconQueue();
  });

  it("limits concurrent pipeline workers to MAX_INFLIGHT (3)", async () => {
    let activePipelineTasks = 0;
    let maxConcurrentPipelineTasks = 0;

    resolveMock.mockImplementation(async () => {
      activePipelineTasks += 1;
      maxConcurrentPipelineTasks = Math.max(maxConcurrentPipelineTasks, activePipelineTasks);
      await delay(50);
      activePipelineTasks -= 1;
      return stubModel;
    });

    const handle = { id: 9 };
    const entries = Array.from({ length: 8 }, (_, i) => sampleEntry(i));
    scheduleCatalogIconBakesFlat(entries, handle, "3d", 512, 512);

    await vi.waitFor(
      () => {
        expect(resolveMock.mock.calls.length).toBeGreaterThanOrEqual(8);
      },
      { timeout: 8000 },
    );

    expect(maxConcurrentPipelineTasks).toBeLessThanOrEqual(3);
    expect(maxConcurrentPipelineTasks).toBeGreaterThan(1);
  });

  it("runs selected-priority bakes before prefetch", async () => {
    const resolveOrder: string[] = [];

    resolveMock.mockImplementation(async (_handle, entryId: string) => {
      resolveOrder.push(entryId);
      await delay(30);
      return stubModel;
    });

    const handle = { id: 2 };
    const prefetch = sampleEntry(0);
    const selected = sampleEntry(1);

    scheduleCatalogIconBakes(
      [
        { entries: [prefetch], priority: "prefetch" },
        { entries: [selected], priority: "selected" },
      ],
      handle,
      "3d",
      512,
      512,
    );

    await vi.waitFor(() => expect(resolveOrder.length).toBeGreaterThanOrEqual(2), {
      timeout: 5000,
    });

    expect(resolveOrder[0]).toBe(selected.id);
    expect(resolveOrder[1]).toBe(prefetch.id);
  });

  it("cancelInvisibleIconBakes drops queued visible/prefetch tasks outside keepKeys", async () => {
    resolveMock.mockImplementation(async () => {
      await delay(200);
      return stubModel;
    });

    const handle = { id: 3 };
    const entries = Array.from({ length: 8 }, (_, i) => sampleEntry(10 + i));
    scheduleCatalogIconBakesFlat(entries, handle, "3d", 512, 512);

    await delay(0);
    const depthBefore = getCatalogIconQueueDepth();
    const keepKey = catalogIconCacheKey(handle.id, entries[0]!.iconKey);
    cancelInvisibleIconBakes(new Set([keepKey]));
    expect(getCatalogIconQueueDepth()).toBeLessThan(depthBefore);

    await vi.waitFor(() => expect(getCatalogIconQueueDepth()).toBe(0), { timeout: 8000 });
  });

  it("cancelInvisibleIconBakes preserves selected-priority tasks", async () => {
    resolveMock.mockImplementation(async () => {
      await delay(200);
      return stubModel;
    });

    const handle = { id: 4 };
    const selected = sampleEntry(20);
    const prefetch = sampleEntry(21);

    scheduleCatalogIconBakes(
      [
        { entries: [selected], priority: "selected" },
        { entries: [prefetch], priority: "prefetch" },
      ],
      handle,
      "3d",
      512,
      512,
    );

    await delay(0);
    cancelInvisibleIconBakes(new Set());

    await vi.waitFor(
      () => {
        const resolvedIds = resolveMock.mock.calls.map((call) => call[1] as string);
        expect(resolvedIds).toContain(selected.id);
      },
      { timeout: 5000 },
    );
  });

  it("reports queue depth while work is pending", async () => {
    resolveMock.mockImplementation(async () => {
      await delay(120);
      return stubModel;
    });

    const handle = { id: 6 };
    scheduleCatalogIconBakesFlat(
      Array.from({ length: 5 }, (_, i) => sampleEntry(200 + i)),
      handle,
      "3d",
      512,
      512,
    );

    await delay(0);
    expect(getCatalogIconQueueDepth()).toBeGreaterThan(0);

    await vi.waitFor(() => expect(getCatalogIconQueueDepth()).toBe(0), { timeout: 8000 });
  });
});
