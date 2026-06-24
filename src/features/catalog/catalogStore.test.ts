import { beforeEach, describe, expect, it } from "vitest";

import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { useProjectStore } from "../../state/projectStore";
import { useCatalogStore } from "./catalogStore";
import {
  clearStudioResolveCache,
  getStudioResolveCache,
  setStudioResolveCache,
  studioResolveKey,
} from "./studioResolveCache";

const sampleEntry = {
  id: "minecraft:stone",
  namespace: "minecraft",
  displayName: "Stone",
  kind: "block" as const,
  sourcePath: "assets/minecraft/blockstates/stone.json",
  resolveKind: "blockstate" as const,
  category: "building" as const,
  searchTokens: [],
  texturePaths: [],
  iconKey: "minecraft:stone:",
  aliases: [],
  studioModelPath: "assets/minecraft/blockstates/stone.json",
  presentation: "block" as const,
};

describe("catalogStore", () => {
  beforeEach(() => {
    useCatalogStore.getState().reset();
  });

  it("merges paginated entries without duplicates", () => {
    const dirt = {
      ...sampleEntry,
      id: "minecraft:dirt",
      displayName: "Dirt",
      sourcePath: "assets/minecraft/blockstates/dirt.json",
      studioModelPath: "assets/minecraft/blockstates/dirt.json",
      iconKey: "minecraft:dirt:",
    };
    useCatalogStore.getState().setQueryPage([sampleEntry], 2, false, 0);
    useCatalogStore.getState().setQueryPage([dirt], 2, true, 1);
    expect(useCatalogStore.getState().entries).toHaveLength(2);
    expect(useCatalogStore.getState().hasMore).toBe(false);
  });

  it("selectEntry tracks selected id and entry", () => {
    useCatalogStore.getState().selectEntry(sampleEntry);
    expect(useCatalogStore.getState().selectedId).toBe("minecraft:stone");
    expect(useCatalogStore.getState().selectedEntry?.displayName).toBe("Stone");
    useCatalogStore.getState().clearSelection();
    expect(useCatalogStore.getState().selectedId).toBeNull();
  });

  it("reset restores initial query state", () => {
    useCatalogStore.getState().setSearch("torch");
    useCatalogStore.getState().setQueryPage([sampleEntry], 1, false, 0);
    useCatalogStore.getState().setQueryError("boom");
    useCatalogStore.getState().reset();
    expect(useCatalogStore.getState().entries).toEqual([]);
    expect(useCatalogStore.getState().search).toBe("");
    expect(useCatalogStore.getState().queryError).toBeNull();
  });

  it("refreshCatalogCaches clears studio resolve cache for open project", () => {
    clearStudioResolveCache();
    useProjectStore.setState({ handle: { id: 7 } } as Partial<ReturnType<typeof useProjectStore.getState>>);
    const key = studioResolveKey(7, "minecraft:stone", "");
    setStudioResolveCache(key, { kind: "block" } as import("../../ipc/types").RenderableModel);
    refreshCatalogCaches();
    expect(getStudioResolveCache(key)).toBeUndefined();
    expect(useCatalogStore.getState().queryRevision).toBe(1);
  });
});
