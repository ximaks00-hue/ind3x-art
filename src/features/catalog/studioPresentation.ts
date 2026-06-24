import type { CatalogEntry, CatalogPresentation } from "../../ipc/types";
import type { CameraPreset, DisplaySlot } from "../../lib/cameraPresets";

/** Item/tool studio view: world placement vs handheld vs inventory GUI. */
export type StudioItemView = "placed" | "hand" | "gui";

export function isItemPresentation(presentation: CatalogPresentation | undefined): boolean {
  return presentation === "item" || presentation === "tool" || presentation === "food";
}

export function defaultStudioItemView(presentation: CatalogPresentation | undefined): StudioItemView {
  if (presentation === "food") return "gui";
  if (presentation === "tool" || presentation === "item") return "hand";
  return "placed";
}

export function studioCameraFor(
  presentation: CatalogPresentation | undefined,
  itemView: StudioItemView,
): CameraPreset {
  if (!isItemPresentation(presentation) || itemView === "placed") return "iso";
  if (itemView === "hand") return "front";
  return "inventory";
}

export function studioDisplaySlotFor(
  presentation: CatalogPresentation | undefined,
  itemView: StudioItemView,
): DisplaySlot | undefined {
  if (!isItemPresentation(presentation) || itemView === "placed") return undefined;
  if (itemView === "hand") return "thirdperson_righthand";
  return "gui";
}

export function studioItemViewOptions(
  presentation: CatalogPresentation | undefined,
): StudioItemView[] | null {
  if (!isItemPresentation(presentation) || presentation === "food") return null;
  return ["placed", "hand", "gui"];
}

export const STUDIO_ITEM_VIEW_LABELS: Record<StudioItemView, string> = {
  placed: "Placed",
  hand: "Hand",
  gui: "GUI",
};

export function entryPresentation(entry: CatalogEntry | null): CatalogPresentation {
  if (!entry) return "block";
  return entry.presentation ?? (entry.kind === "item" ? "item" : "block");
}
