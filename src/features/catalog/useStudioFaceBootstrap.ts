import { useEffect, useRef } from "react";

import type { CatalogEntry, RenderableModel } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useCatalogStore } from "./catalogStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useViewerStore } from "../../state/viewerStore";
import {
  defaultStudioItemView,
  entryPresentation,
  isItemPresentation,
  studioCameraFor,
  studioDisplaySlotFor,
  type StudioItemView,
} from "./studioPresentation";

/** Studio: camera/display framing when catalog selection or variant changes (browse-first, no forced paint). */
export function useStudioFaceBootstrap(
  model: RenderableModel | null,
  entry: CatalogEntry | null,
  itemView: StudioItemView,
  variantKey?: string,
) {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const handle = useProjectStore((s) => s.handle);
  const catalogSelectedId = useCatalogStore((s) => s.selectedId);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const setDisplaySlot = useViewerStore((s) => s.setDisplaySlot);
  const bootstrappedCatalogIdRef = useRef<string | null>(null);

  const presentation = entryPresentation(entry);

  const bootstrapKey = catalogSelectedId
    ? `${catalogSelectedId}:${variantKey ?? ""}:${isItemPresentation(presentation) ? itemView : ""}`
    : null;

  useEffect(() => {
    if (workspaceMode !== "studio" || !model || !catalogSelectedId || !bootstrapKey) return;

    if (bootstrappedCatalogIdRef.current === bootstrapKey) return;
    bootstrappedCatalogIdRef.current = bootstrapKey;

    const view = isItemPresentation(presentation)
      ? itemView
      : defaultStudioItemView(presentation);
    setCameraPreset(studioCameraFor(presentation, view));
    const slot = studioDisplaySlotFor(presentation, view);
    if (slot) setDisplaySlot(slot);
  }, [
    workspaceMode,
    model,
    catalogSelectedId,
    bootstrapKey,
    presentation,
    itemView,
    setCameraPreset,
    setDisplaySlot,
  ]);

  useEffect(() => {
    bootstrappedCatalogIdRef.current = null;
  }, [handle?.id]);

  useEffect(() => {
    if (workspaceMode !== "studio") {
      bootstrappedCatalogIdRef.current = null;
    }
  }, [workspaceMode]);
}
