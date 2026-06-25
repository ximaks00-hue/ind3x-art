import { beforeEach, describe, expect, it } from "vitest";

import { useViewerStore } from "./viewerStore";

describe("viewerStore activeTextureMeta", () => {
  beforeEach(() => {
    useViewerStore.getState().clearActiveTextureMeta();
  });

  it("evicts oldest meta entries beyond the session cap", () => {
    const store = useViewerStore.getState();
    for (let i = 0; i < 260; i++) {
      store.setActiveTextureMeta({
        [`assets/minecraft/textures/block/t${i}.png`]: {
          width: 16,
          height: 16,
          animation: null,
        },
      });
    }
    const keys = Object.keys(useViewerStore.getState().activeTextureMeta);
    expect(keys.length).toBeLessThanOrEqual(256);
    expect(keys).not.toContain("assets/minecraft/textures/block/t0.png");
    expect(keys).toContain("assets/minecraft/textures/block/t259.png");
  });
});
