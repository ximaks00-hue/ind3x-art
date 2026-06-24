import { describe, expect, it } from "vitest";

import type { AssetEntry } from "../../ipc/types";
import { buildFilesystemRows, buildFlatRows, buildGroupedRows } from "./buildTree";

function asset(path: string, kind: AssetEntry["kind"] = "texture"): AssetEntry {
  return {
    id: path,
    path,
    displayName: path.split("/").pop() ?? path,
    namespace: path.split("/")[1] ?? "minecraft",
    kind,
  };
}

describe("buildGroupedRows", () => {
  it("groups by namespace and kind", () => {
    const rows = buildGroupedRows(
      [
        asset("assets/minecraft/textures/block/stone.png"),
        asset("assets/minecraft/textures/block/dirt.png", "texture"),
        asset("assets/custom/textures/item/sword.png"),
      ],
      new Set(),
    );

    const groups = rows.filter((r) => r.type === "group");
    expect(groups.some((g) => g.id === "ns:minecraft")).toBe(true);
    expect(groups.some((g) => g.id === "ns:custom")).toBe(true);
    expect(rows.filter((r) => r.type === "asset")).toHaveLength(3);
  });

  it("respects collapsed groups", () => {
    const rows = buildGroupedRows(
      [asset("assets/minecraft/textures/block/stone.png")],
      new Set(["ns:minecraft"]),
    );
    expect(rows.filter((r) => r.type === "asset")).toHaveLength(0);
  });

  it("emits assets for kinds outside KIND_ORDER", () => {
    const entry = {
      ...asset("assets/minecraft/atlases/blocks.json"),
      kind: "other" as const,
    };
    const rows = buildGroupedRows([entry], new Set());
    expect(rows.some((r) => r.type === "asset" && r.entry.id === entry.id)).toBe(true);
  });
});

describe("buildFlatRows", () => {
  it("maps assets to depth-0 rows", () => {
    const entries = [asset("assets/minecraft/textures/block/stone.png")];
    const rows = buildFlatRows(entries);
    expect(rows).toEqual([{ type: "asset", entry: entries[0], depth: 0 }]);
  });
});

describe("buildFilesystemRows", () => {
  it("builds nested directory groups", () => {
    const rows = buildFilesystemRows(
      [asset("assets/minecraft/textures/block/stone.png")],
      new Set(),
    );
    const groups = rows.filter((r) => r.type === "group");
    expect(groups.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.type === "asset")).toBe(true);
  });

  it("shows subdirectory assets when a path is both a file and directory prefix", () => {
    const rows = buildFilesystemRows(
      [
        asset("assets/minecraft"),
        asset("assets/minecraft/textures/block/stone.png"),
      ],
      new Set(),
    );
    expect(rows.filter((r) => r.type === "asset")).toHaveLength(2);
    expect(rows.some((r) => r.type === "asset" && r.entry.path.endsWith("stone.png"))).toBe(
      true,
    );
  });
});
