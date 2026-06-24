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

    const orderedKinds = [
      ...KIND_ORDER.filter((kind) => kinds.has(kind)),
      ...[...kinds.keys()]
        .filter((kind) => !KIND_ORDER.includes(kind))
        .sort(),
    ];

    for (const kind of orderedKinds) {
      const items = kinds.get(kind)!;
      const kindId = `${nsId}/kind:${kind}`;
      rows.push({
        type: "group",
        id: kindId,
        label: ASSET_KIND_LABELS[kind] ?? kind,
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

  function sortedChildKeys(node: TrieNode): string[] {
    return [...node.children.keys()].sort((a, b) => {
      const aChild = node.children.get(a)!;
      const bChild = node.children.get(b)!;
      const aIsDir = aChild.children.size > 0 || !aChild.entry;
      const bIsDir = bChild.children.size > 0 || !bChild.entry;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.localeCompare(b);
    });
  }

  function countLeaves(node: TrieNode): number {
    if (node.entry && node.children.size === 0) return 1;
    let count = node.entry ? 1 : 0;
    for (const child of node.children.values()) {
      count += countLeaves(child);
    }
    return count;
  }

  function countChildLeaves(node: TrieNode): number {
    let count = 0;
    for (const child of node.children.values()) {
      count += countLeaves(child);
    }
    return count;
  }

  function visitChildren(node: TrieNode, pathSoFar: string, depth: number) {
    for (const key of sortedChildKeys(node)) {
      emitNode(node.children.get(key)!, pathSoFar ? `${pathSoFar}/${key}` : key, key, depth);
    }
  }

  function emitNode(node: TrieNode, id: string, label: string, depth: number) {
    const hasChildren = node.children.size > 0;

    if (node.entry) {
      rows.push({ type: "asset", entry: node.entry, depth });
    }

    if (!hasChildren) return;

    const childCount = countChildLeaves(node);
    if (childCount === 0) return;

    const groupId = node.entry ? `${id}/` : id;
    const groupLabel = node.entry ? `${label}/` : label;
    rows.push({
      type: "group",
      id: groupId,
      label: groupLabel,
      depth,
      count: childCount,
    });

    if (!collapsed.has(groupId)) {
      visitChildren(node, id, depth + 1);
    }
  }

  visitChildren(root, "", 0);
  return rows;
}
