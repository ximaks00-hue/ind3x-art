import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import {
  getCatalogIconCache,
  catalogIconCacheKey,
  resetCatalogIconCache,
} from "./catalogIconCache";
import { scheduleCatalogIconBakes } from "./catalogIconPipeline";

const ipcMock = vi.hoisted(() => ({
  getTexturePreview: vi.fn(),
}));

vi.mock("../../ipc/client", () => ({
  ipc: ipcMock,
}));

vi.mock("../../app/services/catalogService", () => ({
  resolveCatalogEntry: vi.fn(),
}));

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
  };

  beforeEach(() => {
    resetCatalogIconCache();
    vi.clearAllMocks();
    ipcMock.getTexturePreview.mockRejectedValue(new Error("texture missing"));
  });

  it("records icon bake failure when preview fails", async () => {
    scheduleCatalogIconBakes([entry], { id: 1 }, "preview", 256, 256);
    await vi.waitFor(() => {
      const key = catalogIconCacheKey(1, entry.iconKey);
      expect(getCatalogIconCache(256).get(key)).toBeUndefined();
    }, { timeout: 3000 });
  });

  it("shouldBakeTier1 respects texture path presence", async () => {
    const { shouldBakeTier1 } = await import("./catalogIconPipeline");
    expect(shouldBakeTier1(entry, "auto")).toBe(true);
    expect(shouldBakeTier1({ ...entry, texturePaths: [] }, "auto")).toBe(false);
  });
});
