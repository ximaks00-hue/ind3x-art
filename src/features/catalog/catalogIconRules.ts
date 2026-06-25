import type { CatalogEntry } from "../../ipc/types";

export type CatalogIconMode = "auto" | "preview" | "3d";
export type CatalogIconBakePriority = "selected" | "visible" | "prefetch";

/** Tier-2 3D bake: selected only in auto; all entries in 3d mode. */
export function shouldUpgradeTo3d(
  _entry: CatalogEntry,
  mode: CatalogIconMode,
  priority: CatalogIconBakePriority = "visible",
): boolean {
  if (mode === "preview") return false;
  if (mode === "3d") return true;
  return priority === "selected";
}

/** Tier-1 flat texture: primary path for grid cells in auto mode. */
export function shouldBakeTier1(
  _entry: CatalogEntry,
  mode: CatalogIconMode,
  _priority: CatalogIconBakePriority = "visible",
): boolean {
  if (mode === "preview") return true;
  if (mode === "3d") return false;
  return true;
}

export function shouldAttemptIconBake(
  entry: CatalogEntry,
  mode: CatalogIconMode,
  priority: CatalogIconBakePriority = "visible",
): boolean {
  return shouldUpgradeTo3d(entry, mode, priority) || shouldBakeTier1(entry, mode, priority);
}
