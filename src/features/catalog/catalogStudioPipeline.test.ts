import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogFilter, IndexEvent, PageReq } from "../../ipc/types";
import { buildSyntheticCatalog, E2E_CATALOG_SIZE } from "../../ipc/e2eCatalogFixture";

const mockCatalog = buildSyntheticCatalog(E2E_CATALOG_SIZE);

function queryCatalogMock(filter: CatalogFilter, page: PageReq) {
  let entries = mockCatalog;
  if (filter.category) {
    entries = entries.filter((entry) => entry.category === filter.category);
  }
  if (filter.namespace) {
    entries = entries.filter((entry) => entry.namespace === filter.namespace);
  }
  if (filter.search) {
    const query = filter.search.toLowerCase();
    entries = entries.filter(
      (entry) =>
        entry.displayName.toLowerCase().includes(query) ||
        entry.id.toLowerCase().includes(query) ||
        entry.searchTokens.some((token) => token.toLowerCase().includes(query)),
    );
  }
  const slice = entries.slice(page.offset, page.offset + page.limit);
  return { entries: slice, total: entries.length };
}

const ipcMock = vi.hoisted(() => ({
  openSource: vi.fn(),
  queryCatalog: vi.fn(),
  saveTextures: vi.fn(),
}));

vi.mock("../../ipc/client", () => ({
  ipc: ipcMock,
  IpcError: class IpcError extends Error {},
  isCoreError: () => false,
}));

import { queryCatalog } from "../../app/services/catalogService";
import { ipc } from "../../ipc/client";
import { applyCatalogSelection } from "./catalogSelection";
import { useCatalogStore } from "./catalogStore";
import { CATALOG_PAGE_SIZE } from "./useCatalogQuery";
import { catalogRowCount } from "./catalogUtils";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { transitionToWorkspaceMode } from "../../app/useWorkspaceMode";

async function openFixtureProject() {
  const onEvent = { onmessage: null as ((event: IndexEvent) => void) | null };
  const result = await ipc.openSource("tests/fixtures/simple_pack", onEvent as never);
  useProjectStore.getState().finishOpen(result);
  useProjectStore.getState().setIndexStatus("done");
  useCatalogStore.getState().bumpQueryRevision();
  return result;
}

describe("studio catalog scale (mock IPC)", () => {
  beforeEach(() => {
    useCatalogStore.getState().reset();
    useProjectStore.setState({
      handle: null,
      sourcePath: null,
      indexStatus: "idle",
    });
    vi.clearAllMocks();
    ipcMock.openSource.mockResolvedValue({
      handle: { id: 1 },
      sourcePath: "tests/fixtures/simple_pack",
      sourceKind: "folder",
      entryCount: 3,
      fromCache: false,
      catalogFromCache: false,
      catalogEntryCount: E2E_CATALOG_SIZE,
      packFormat: 15,
      catalogLanguage: "en_us",
    });
    ipcMock.queryCatalog.mockImplementation(
      async (_handle, filter: CatalogFilter, page: PageReq) => queryCatalogMock(filter, page),
    );
    ipcMock.saveTextures.mockResolvedValue({ savedCount: 1 });
  });

  it("serves 2000+ catalog entries with paginated query", async () => {
    const { handle } = await openFixtureProject();
    const first = await queryCatalog(
      handle,
      { category: null, namespace: null, search: null, fuzzy: false },
      { offset: 0, limit: CATALOG_PAGE_SIZE },
    );
    expect(first.total).toBeGreaterThanOrEqual(2_000);
    expect(first.total).toBe(E2E_CATALOG_SIZE);
    expect(first.entries.length).toBe(CATALOG_PAGE_SIZE);

    const second = await queryCatalog(
      handle,
      { category: null, namespace: null, search: null, fuzzy: false },
      { offset: CATALOG_PAGE_SIZE, limit: CATALOG_PAGE_SIZE },
    );
    expect(second.entries.length).toBe(CATALOG_PAGE_SIZE);
    expect(second.entries[0]?.id).not.toBe(first.entries[0]?.id);
  });

  it("virtualizes large grids with bounded row count", () => {
    expect(catalogRowCount(E2E_CATALOG_SIZE)).toBe(Math.ceil(E2E_CATALOG_SIZE / 9));
    expect(catalogRowCount(E2E_CATALOG_SIZE)).toBeLessThan(300);
  });

  it("studio select wires catalog to project store", async () => {
    const { handle } = await openFixtureProject();
    useSettingsStore.setState({ workspaceMode: "classic" });
    transitionToWorkspaceMode("studio");

    const page = await queryCatalog(
      handle,
      { category: null, namespace: null, search: "test_stone", fuzzy: false },
      { offset: 0, limit: 20 },
    );
    const entry = page.entries.find((row) => row.id === "minecraft:test_stone");
    expect(entry).toBeDefined();
    applyCatalogSelection(entry!);

    expect(useCatalogStore.getState().selectedId).toBe("minecraft:test_stone");
    expect(useCatalogStore.getState().selectedEntry?.displayName).toBe("Test Stone");
    expect(useSettingsStore.getState().workspaceMode).toBe("studio");

    const saved = await ipc.saveTextures(handle, [
      {
        path: "assets/minecraft/textures/block/test_stone.png",
        pngBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgMBAp2lAgAAAABJRU5ErkJggg==",
      },
    ]);
    expect(saved.savedCount).toBe(1);
  });
});
