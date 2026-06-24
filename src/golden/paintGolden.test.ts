import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../ipc/types";
import { mockTexturePreview } from "../test/paintTestDoc";
import { ipc } from "../ipc/client";
import { comparePngBuffers, canvasToPngBuffer } from "./comparePng";
import { collectStrokeChanges } from "../features/editor/tools";
import {
  clearTextureDocuments,
  commitChanges,
  getTextureCanvas,
} from "../features/editor/textureDocument";

vi.mock("../ipc/client", () => ({
  ipc: {
    getTextureBinary: vi.fn().mockRejectedValue(new Error("no binary")),
    getTexture: vi.fn(),
  },
}));

vi.mock("../features/viewer3d/textureLoader", () => ({
  refreshTextureFromCanvas: vi.fn(),
}));

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "baselines");
const MAX_DIFF = 0.02;
const handle: ProjectHandle = { id: 1 };
const path = "assets/minecraft/textures/block/golden.png";

async function renderBaseline() {
  clearTextureDocuments();
  vi.mocked(ipc.getTexture).mockResolvedValue(
    mockTexturePreview(16, 16, [32, 32, 32, 255]),
  );
  const { ensureTextureDocument } = await import("../features/editor/textureDocument");
  await ensureTextureDocument(handle, path);
  const changes = collectStrokeChanges(
    path,
    [
      [4, 4],
      [5, 4],
    ],
    "pencil",
    "#ff0000",
    true,
    true,
  );
  commitChanges(handle, path, changes);
  const canvas = getTextureCanvas(path)!;
  return canvasToPngBuffer(canvas);
}

describe("golden paint renders", () => {
  beforeEach(() => {
    if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
  });

  it("matches pencil symmetry baseline within 2%", async () => {
    const name = "pencil-symmetry-16.png";
    const baselinePath = join(GOLDEN_DIR, name);
    const actual = await renderBaseline();

    if (!existsSync(baselinePath) || process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(baselinePath, actual);
    }

    const expected = readFileSync(baselinePath);
    const { diffRatio, mismatchedPixels } = await comparePngBuffers(actual, expected, 1);
    expect(diffRatio).toBeLessThanOrEqual(MAX_DIFF);
    expect(mismatchedPixels).toBeLessThanOrEqual(Math.ceil(16 * 16 * MAX_DIFF));
  });
});
