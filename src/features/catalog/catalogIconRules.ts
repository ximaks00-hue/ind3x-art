import type { CatalogEntry } from "../../ipc/types";

export type CatalogIconMode = "auto" | "preview" | "3d";

/** Phase B: catalog icons always bake 3D first (Creative inventory style). */
export function shouldUpgradeTo3d(_entry: CatalogEntry, mode: CatalogIconMode): boolean {
  return mode !== "preview";
}

/** Tier-1 flat texture is fallback only — never scheduled as primary path. */
export function shouldBakeTier1(_entry: CatalogEntry, mode: CatalogIconMode): boolean {
  return mode === "preview";
}

export function shouldAttemptIconBake(
  entry: CatalogEntry,
  mode: CatalogIconMode,
): boolean {
  return shouldUpgradeTo3d(entry, mode) || shouldBakeTier1(entry, mode);
}
