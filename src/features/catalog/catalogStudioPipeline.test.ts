import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexEvent } from "../../ipc/types";

vi.mock("../../ipc/client", async () => {
  const { createE2eMockIpc } = await import("../../ipc/e2eMock");
  return {
    ipc: createE2eMockIpc(),
    IpcError: class IpcError extends Error {},
    isCoreError: () => false,
  };
});

import { queryCatalog } from "../../app/services/catalogService";
import { E2E_CATALOG_SIZE } from "../../ipc/e2eCatalogFixture";
import { ipc } from "../../ipc/client";
import { useCatalogStore } from "./catalogStore";
import { CATALOG_PAGE_SIZE } from "./useCatalogQuery";
import { catalogRowCount } from "./catalogUtils";
import { useProjectStore } from "../../state/projectStore";

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
    await openFixtureProject();
    await window.__E2E__!.openStudioFixture();
    const total = await window.__E2E__!.getCatalogTotal();
    expect(total).toBe(E2E_CATALOG_SIZE);

    await window.__E2E__!.selectCatalogEntry("minecraft:test_stone");
    expect(useCatalogStore.getState().selectedId).toBe("minecraft:test_stone");
    expect(useProjectStore.getState().selectedAsset?.displayName).toBe("Test Stone");

    const handle = useProjectStore.getState().handle!;
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
