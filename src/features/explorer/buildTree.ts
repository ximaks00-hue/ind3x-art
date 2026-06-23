import type { AssetEntry, AssetKind } from "../../ipc/types";
import { ASSET_KIND_LABELS } from "../../ipc/types";

export type ExplorerRow =
  | {
      type: "group";
      id: string;
      label: string;
      depth: number;
      count: number;
    }
  | {
      type: "asset";
      entry: AssetEntry;
      depth: number;
    };

const KIND_ORDER: AssetKind[] = [
  "texture",
  "textureMeta",
  "blockModel",
  "itemModel",
  "blockstate",
  "packMeta",
  "lang",
  "sound",
  "other",
];

export function buildGroupedRows(
  assets: AssetEntry[],
  collapsed: ReadonlySet<string>,
): ExplorerRow[] {
  const byNs = new Map<string, Map<AssetKind, AssetEntry[]>>();

  for (const entry of assets) {
    if (!byNs.has(entry.namespace)) {
      byNs.set(entry.namespace, new Map());
    }
    const kinds = byNs.get(entry.namespace)!;
    if (!kinds.has(entry.kind)) {
      kinds.set(entry.kind, []);
    }
    kinds.get(entry.kind)!.push(entry);
  }

  const namespaces = [...byNs.keys()].sort();
  const rows: ExplorerRow[] = [];

  for (const ns of namespaces) {
    const nsId = `ns:${ns}`;
    const kinds = byNs.get(ns)!;
    const nsCount = [...kinds.values()].reduce((n, arr) => n + arr.length, 0);
    rows.push({
      type: "group",
      id: nsId,
      label: ns,
      depth: 0,
      count: nsCount,
    });

    if (collapsed.has(nsId)) continue;

    for (const kind of KIND_ORDER) {
      const items = kinds.get(kind);
      if (!items?.length) continue;
      const kindId = `${nsId}/kind:${kind}`;
      rows.push({
        type: "group",
        id: kindId,
        label: ASSET_KIND_LABELS[kind],
        depth: 1,
        count: items.length,
      });

      if (collapsed.has(kindId)) continue;

      for (const entry of items) {
        rows.push({ type: "asset", entry, depth: 2 });
      }
    }
  }

  return rows;
}

export function buildFlatRows(assets: AssetEntry[]): ExplorerRow[] {
  return assets.map((entry) => ({ type: "asset" as const, entry, depth: 0 }));
}

/**
 * Filesystem-like tree: splits each asset's path by "/" and creates intermediate
 * directory group rows, e.g. assets/minecraft/textures/block/ as nesting levels.
 * Collapsed groups suppress children.
 */
export function buildFilesystemRows(
  assets: AssetEntry[],
  collapsed: ReadonlySet<string>,
): ExplorerRow[] {
  // Build trie
  type TrieNode = {
    children: Map<string, TrieNode>;
    entry?: AssetEntry;
  };

  const root: TrieNode = { children: new Map() };

  for (const entry of assets) {
    const parts = entry.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map() });
      }
      node = node.children.get(part)!;
      if (i === parts.length - 1) {
        node.entry = entry;
      }
    }
  }

  const rows: ExplorerRow[] = [];

  function visit(node: TrieNode, pathSoFar: string, depth: number) {
    // Sort: directories first, then files
    const sortedKeys = [...node.children.keys()].sort((a, b) => {
      const aIsDir =
        node.children.get(a)!.children.size > 0 || !node.children.get(a)!.entry;
      const bIsDir =
        node.children.get(b)!.children.size > 0 || !node.children.get(b)!.entry;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      const child = node.children.get(key)!;
      const id = pathSoFar ? `${pathSoFar}/${key}` : key;
      const hasSubDirs = child.children.size > 0;

      if (hasSubDirs && !child.entry) {
        // Pure directory node
        const count = countLeaves(child);
        rows.push({ type: "group", id, label: key, depth, count });
        if (!collapsed.has(id)) {
          visit(child, id, depth + 1);
        }
      } else if (child.entry) {
        // Leaf file
        rows.push({ type: "asset", entry: child.entry, depth });
      }
    }
  }

  function countLeaves(node: TrieNode): number {
    if (node.entry) return 1;
    let count = 0;
    for (const child of node.children.values()) {
      count += countLeaves(child);
    }
    return count;
  }

  visit(root, "", 0);
  return rows;
}
