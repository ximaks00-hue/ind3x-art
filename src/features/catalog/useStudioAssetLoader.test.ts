import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry, ProjectHandle } from "../../ipc/types";

const resolveCatalogEntryMock = vi.hoisted(() => vi.fn());
const listVariantsMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/services/catalogService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/services/catalogService")>();
  return {
    ...actual,
    resolveCatalogEntry: resolveCatalogEntryMock,
    listVariants: listVariantsMock,
  };
});

import { useStudioAssetLoader } from "./useStudioAssetLoader";

const handle: ProjectHandle = { id: 1 };

const entry: CatalogEntry = {
  id: "minecraft:test_stone",
  namespace: "minecraft",
  displayName: "Test Stone",
  kind: "block",
  sourcePath: "assets/minecraft/blockstates/test_stone.json",
  resolveKind: "blockstate",
  defaultVariantKey: "",
  category: "building",
  searchTokens: [],
  texturePaths: [],
  iconKey: "minecraft:test_stone:",
  aliases: [],
  blockId: "minecraft:test_stone",
  itemId: null,
  iconModelPath: null,
  studioModelPath: "assets/minecraft/blockstates/test_stone.json",
  variantKeys: ["", "variant=a"],
  presentation: "block",
};

describe("useStudioAssetLoader", () => {
  beforeEach(() => {
    resolveCatalogEntryMock.mockReset();
    listVariantsMock.mockReset();
    listVariantsMock.mockResolvedValue([
      { key: "", model: "minecraft:block/test_stone", x: 0, y: 0, z: 0, uvlock: false },
      { key: "variant=a", model: "minecraft:block/test_stone", x: 0, y: 0, z: 0, uvlock: false },
    ]);
    resolveCatalogEntryMock.mockResolvedValue({
      kind: "block",
      modelId: "minecraft:block/test_stone",
      cuboids: [],
      textureRefs: {},
      textureMeta: {},
      modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
      display: {},
      ambientOcclusion: true,
    });
  });

  it("resolves catalog entry with placed context", async () => {
    const { result } = renderHook(() => useStudioAssetLoader(handle, entry));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(resolveCatalogEntryMock).toHaveBeenCalledWith(
      handle,
      "minecraft:test_stone",
      "placed",
      "",
    );
    expect(result.current.renderable?.modelId).toBe("minecraft:block/test_stone");
    expect(result.current.variants).toHaveLength(2);
  });

  it("uses variant override without clearing catalog selection", async () => {
    const { result } = renderHook(() =>
      useStudioAssetLoader(handle, entry, "variant=a"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(resolveCatalogEntryMock).toHaveBeenCalledWith(
      handle,
      "minecraft:test_stone",
      "placed",
      "variant=a",
    );
    expect(result.current.variantKey).toBe("variant=a");
  });

  it("returns idle state when handle or entry is null", () => {
    const { result } = renderHook(() => useStudioAssetLoader(null, null));
    expect(result.current.loading).toBe(false);
    expect(result.current.renderable).toBeNull();
    expect(resolveCatalogEntryMock).not.toHaveBeenCalled();
  });
});
