import { describe, expect, it, vi } from "vitest";

const { commandsMock } = vi.hoisted(() => ({
  commandsMock: {
    queryAssets: vi.fn(),
    saveTextures: vi.fn(),
    resolveRenderable: vi.fn(),
    getTextureBinary: vi.fn(),
  },
}));

vi.mock("./bindings", () => ({
  commands: {
    ...commandsMock,
  },
}));

import { spectaCommands } from "./spectaClient";
import { IpcError } from "./errors";

describe("spectaClient", () => {
  it("normalizes filter nullables for queryAssets", async () => {
    commandsMock.queryAssets.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });
    await spectaCommands.queryAssets(
      { id: 1 },
      { kind: null, namespace: null, search: null },
      { offset: 0, limit: 50 },
    );
    expect(commandsMock.queryAssets).toHaveBeenCalledWith(
      { id: 1 },
      { kind: null, namespace: null, search: null, fuzzy: undefined },
      { offset: 0, limit: 50 },
    );
  });

  it("normalizes save options nullables", async () => {
    commandsMock.saveTextures.mockResolvedValue({
      savedCount: 0,
      savedPaths: [],
      originalPaths: [],
      backupPath: null,
    });
    await spectaCommands.saveTextures({ id: 1 }, [], {
      mode: "rename",
      targetPath: undefined,
      namespace: undefined,
    });
    expect(commandsMock.saveTextures).toHaveBeenCalledWith({ id: 1 }, [], {
      mode: "rename",
      targetPath: null,
      namespace: null,
    });
  });

  it("keeps empty string blockstate variant key", async () => {
    commandsMock.resolveRenderable.mockResolvedValue({ elements: [], textureMeta: {} });
    await spectaCommands.resolveRenderable(
      { id: 1 },
      "assets/test/blockstate.json",
      "",
      null,
    );
    expect(commandsMock.resolveRenderable).toHaveBeenCalledWith(
      { id: 1 },
      "assets/test/blockstate.json",
      "",
      null,
    );
  });

  it("maps typed specta errors into IpcError", async () => {
    commandsMock.queryAssets.mockResolvedValue({
      status: "error",
      error: { ProjectNotFound: null },
    });
    await expect(
      spectaCommands.queryAssets(
        { id: 999 },
        { kind: null, namespace: null, search: null },
        { offset: 0, limit: 10 },
      ),
    ).rejects.toBeInstanceOf(IpcError);
  });

  it("decodes base64 texture payload to Uint8Array", async () => {
    commandsMock.getTextureBinary.mockResolvedValue("AQID");
    const bytes = await spectaCommands.getTextureBinary({ id: 1 }, "assets/test.png");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});
