import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import {
  getCatalogIconCache,
  catalogIconCacheKey,
  readCatalogIconState,
  resetCatalogIconCache,
} from "./catalogIconCache";
import { scheduleCatalogIconBakesFlat } from "./catalogIconPipeline";

const catalogServiceMock = vi.hoisted(() => ({
  resolveCatalogEntry: vi.fn(),
  getCatalogIconCache: vi.fn().mockResolvedValue(null),
  setCatalogIconCache: vi.fn().mockResolvedValue(undefined),
}));

const textureServiceMock = vi.hoisted(() => ({
  getTexturePreview: vi.fn(),
}));

vi.mock("../../app/services/catalogService", () => catalogServiceMock);

vi.mock("../../app/services/textureService", () => textureServiceMock);

vi.mock("./CatalogIconRenderer", () => ({
  bakeCatalogIcon3d: vi.fn(),
  bakeCatalogIconFromPreviewAsync: vi.fn(),
  disposeCatalogIconRenderer: vi.fn(),
}));

describe("catalogIconPipeline failures", () => {
  const entry: CatalogEntry = {
    id: "minecraft:test",
    namespace: "minecraft",
    displayName: "Test",
    kind: "block",
    sourcePath: "assets/minecraft/blockstates/test.json",
    resolveKind: "blockstate",
    category: "building",
    searchTokens: [],
    texturePaths: ["assets/minecraft/textures/block/test.png"],
    iconKey: "minecraft:test:",
    aliases: [],
    studioModelPath: "assets/minecraft/blockstates/test.json",
    presentation: "block",
  };

  beforeEach(() => {
    resetCatalogIconCache();
    vi.clearAllMocks();
    textureServiceMock.getTexturePreview.mockRejectedValue(new Error("texture missing"));
  });

  it("records icon bake failure when preview fails", async () => {
    scheduleCatalogIconBakesFlat([entry], { id: 1 }, "preview", 256, 256);
    await vi.waitFor(
      () => {
        const state = readCatalogIconState(1, entry.iconKey, 256);
        expect(state.status).toBe("failed");
        expect(state.error).toContain("texture missing");
        const key = catalogIconCacheKey(1, entry.iconKey);
        expect(getCatalogIconCache(256).get(key)).toBeUndefined();
      },
      { timeout: 3000 },
    );
  });

  it("shouldBakeTier1 is fallback-only in auto mode", async () => {
    const { shouldBakeTier1 } = await import("./catalogIconRules");
    expect(shouldBakeTier1(entry, "auto")).toBe(false);
    expect(shouldBakeTier1(entry, "preview")).toBe(true);
  });
});
