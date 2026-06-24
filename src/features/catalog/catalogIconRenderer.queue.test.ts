import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let activeBakes = 0;
let maxConcurrentBakes = 0;

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class MockWebGLRenderer {
    domElement = document.createElement("canvas");
    setSize() {}
    setClearColor() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

vi.mock("../viewer3d/buildMesh", async (importOriginal) => {
  const { Group } = await import("three");
  return {
    buildModelGroup: vi.fn().mockImplementation(async () => {
      activeBakes += 1;
      maxConcurrentBakes = Math.max(maxConcurrentBakes, activeBakes);
      await delay(30);
      activeBakes -= 1;
      return new Group();
    }),
    disposeObject3D: vi.fn(),
  };
});

import { bakeCatalogIcon3d, disposeCatalogIconRenderer } from "./CatalogIconRenderer";

const handle: ProjectHandle = { id: 1 };

const model: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/stone",
  cuboids: [],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

describe("CatalogIconRenderer queue", () => {
  beforeEach(() => {
    activeBakes = 0;
    maxConcurrentBakes = 0;
    disposeCatalogIconRenderer();
  });

  it("serializes concurrent bakeCatalogIcon3d calls through a single render queue", async () => {
    await Promise.all([
      bakeCatalogIcon3d(model, handle, 48),
      bakeCatalogIcon3d(model, handle, 48),
      bakeCatalogIcon3d(model, handle, 48),
    ]);

    expect(maxConcurrentBakes).toBe(1);
  });
});
