import { useEffect, useMemo, useState } from "react";

import { resolveCatalogEntry } from "../../app/services/catalogService";
import { listVariants } from "../../app/services/catalogService";
import type { CatalogEntry, ProjectHandle, RenderableModel, VariantKey } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { catalogVariantKeysToPicker } from "./catalogUtils";
import { useCatalogStore } from "./catalogStore";
import {
  getStudioResolveCache,
  setStudioResolveCache,
  setStudioResolveCacheLimit,
  studioResolveKey,
} from "./studioResolveCache";
import { modelTexturePaths, refreshDirtyTexturesForViewer } from "../viewer3d/viewerTextureSync";

export interface StudioAssetState {
  renderable: RenderableModel | null;
  variants: VariantKey[];
  variantKey: string | undefined;
  loading: boolean;
  error: string | null;
}

const EMPTY: StudioAssetState = {
  renderable: null,
  variants: [],
  variantKey: undefined,
  loading: false,
  error: null,
};

/**
 * Studio-only asset loader: resolves via catalog entry id (not projectStore.selectedAsset).
 * `catalogStore.selectedEntry` is the single source of truth for selection.
 */
export function useStudioAssetLoader(
  handle: ProjectHandle | null,
  entry: CatalogEntry | null,
  variantKeyOverride?: string,
  reloadTick = 0,
): StudioAssetState {
  const [state, setState] = useState<StudioAssetState>(EMPTY);
  const [resolvedVariants, setResolvedVariants] = useState<VariantKey[]>([]);
  const queryRevision = useCatalogStore((s) => s.queryRevision);
  const modelCacheLimit = useSettingsStore((s) => s.modelCacheLimit);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setHoveredFace = useSelectionStore((s) => s.setHoveredFace);
  const setActiveTextureMeta = useViewerStore((s) => s.setActiveTextureMeta);

  const entryId = entry?.id ?? null;
  const fallbackVariants = useMemo(
    () =>
      entry?.variantKeys?.length ? catalogVariantKeysToPicker(entry.variantKeys) : [],
    [entry?.variantKeys],
  );
  const variants = resolvedVariants.length > 0 ? resolvedVariants : fallbackVariants;
  const resolvedVariantKey =
    variantKeyOverride ?? entry?.defaultVariantKey ?? variants[0]?.key;

  useEffect(() => {
    setStudioResolveCacheLimit(modelCacheLimit);
  }, [modelCacheLimit]);

  useEffect(() => {
    if (!handle || !entry || entry.resolveKind !== "blockstate") {
      setResolvedVariants([]);
      return;
    }
    let cancelled = false;
    void listVariants(handle, entry.studioModelPath)
      .then((rows) => {
        if (!cancelled) setResolvedVariants(rows);
      })
      .catch(() => {
        if (!cancelled) setResolvedVariants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, entry?.id, entry?.resolveKind, entry?.studioModelPath, queryRevision]);

  useEffect(() => {
    if (!entryId) return;
    clearSelection();
    setHoveredFace(null);
  }, [entryId, resolvedVariantKey, clearSelection, setHoveredFace]);

  const variantKeysSig = (entry?.variantKeys ?? []).join("\0");
  const resolvedVariantSig = resolvedVariants
    .map((v) => `${v.key}:${v.model}:${v.weight ?? ""}`)
    .join("\0");

  useEffect(() => {
    if (!handle || !entryId) {
      setState(EMPTY);
      return;
    }

    const activeVariants =
      resolvedVariants.length > 0 ? resolvedVariants : fallbackVariants;

    if (entry?.resolveKind === "texture") {
      setState({
        renderable: null,
        variants: activeVariants,
        variantKey: resolvedVariantKey,
        loading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;

    setState({
      renderable: null,
      variants: activeVariants,
      variantKey: resolvedVariantKey,
      loading: true,
      error: null,
    });

    const cacheKey =
      handle && entryId
        ? studioResolveKey(handle.id, entryId, resolvedVariantKey)
        : null;
    const cached = cacheKey ? getStudioResolveCache(cacheKey) : undefined;
    if (cached) {
      refreshDirtyTexturesForViewer(handle, modelTexturePaths(cached));
      setActiveTextureMeta(cached.textureMeta);
      setState({
        renderable: cached,
        variants: activeVariants,
        variantKey: resolvedVariantKey,
        loading: false,
        error: null,
      });
      return;
    }

    void (async () => {
      try {
        const model = await resolveCatalogEntry(
          handle,
          entryId,
          "placed",
          resolvedVariantKey ?? null,
        );
        if (cancelled) return;
        if (cacheKey) setStudioResolveCache(cacheKey, model);
        refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));
        setActiveTextureMeta(model.textureMeta);
        setState({
          renderable: model,
          variants: activeVariants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          renderable: null,
          variants: activeVariants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to resolve catalog entry",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    handle,
    entryId,
    resolvedVariantKey,
    reloadTick,
    queryRevision,
    setActiveTextureMeta,
    entry?.resolveKind,
    variantKeysSig,
    resolvedVariantSig,
  ]);

  return { ...state, variants, variantKey: resolvedVariantKey };
}
