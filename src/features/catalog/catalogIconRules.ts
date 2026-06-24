import type { CatalogEntry } from "../../ipc/types";

export type CatalogIconMode = "auto" | "preview" | "3d";

/** Items and texture-less entries get tier-2 GUI bake in auto mode. */
export function shouldUpgradeTo3d(entry: CatalogEntry, mode: CatalogIconMode): boolean {
  if (mode === "preview") return false;
  if (mode === "3d") return true;
  return entry.kind === "item" || entry.texturePaths.length === 0;
}

export function shouldBakeTier1(entry: CatalogEntry, mode: CatalogIconMode): boolean {
  if (mode === "3d") return false;
  return Boolean(entry.texturePaths[0]);
}

export function shouldAttemptIconBake(
  entry: CatalogEntry,
  mode: CatalogIconMode,
): boolean {
  return shouldBakeTier1(entry, mode) || shouldUpgradeTo3d(entry, mode);
}
