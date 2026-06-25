import { useEffect, useMemo, useRef, useState } from "react";

import { resolveCatalogEntry, listVariants } from "../../app/services/catalogService";
import type { CatalogEntry, ProjectHandle, RenderableModel, VariantKey } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { buildCubeAllPreviewModel } from "../viewer3d/cubeWrapPreview";
import { catalogVariantKeysToPicker } from "./catalogUtils";
import { useCatalogStore } from "./catalogStore";
import {
  clearStudioResolveCacheForHandle,
  getStudioResolveCache,
  setStudioResolveCache,
  setStudioResolveCacheLimit,
  studioResolveKey,
} from "./studioResolveCache";
import { modelTexturePaths, refreshDirtyTexturesForViewer } from "../viewer3d/viewerTextureSync";
import { resolveWithTimeout } from "../../lib/resolveWithTimeout";

export interface StudioAssetState {
  renderable: RenderableModel | null;
  variants: VariantKey[];
  variantKey: string | undefined;
  loading: boolean;
  error: string | null;
  variantLoadError: string | null;
}

const RESOLVE_TIMEOUT_MS = 45_000;

const EMPTY: StudioAssetState = {
  renderable: null,
  variants: [],
  variantKey: undefined,
  loading: false,
  error: null,
  variantLoadError: null,
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
  const [variantLoadError, setVariantLoadError] = useState<string | null>(null);
  const variantsAbortRef = useRef<AbortController | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const queryRevision = useCatalogStore((s) => s.queryRevision);
  const modelCacheLimit = useSettingsStore((s) => s.modelCacheLimit);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setHoveredFace = useSelectionStore((s) => s.setHoveredFace);
  const setActiveTextureMeta = useViewerStore((s) => s.setActiveTextureMeta);

  const entryId = entry?.id ?? null;
  const variantKeysFingerprint = entry?.variantKeys?.join("\0") ?? "";
  const fallbackVariants = useMemo(
    () =>
      entry?.variantKeys?.length ? catalogVariantKeysToPicker(entry.variantKeys) : [],
    [variantKeysFingerprint],
  );
  const variants = resolvedVariants.length > 0 ? resolvedVariants : fallbackVariants;
  const resolvedVariantKey =
    variantKeyOverride ?? entry?.defaultVariantKey ?? variants[0]?.key;

  useEffect(() => {
    setStudioResolveCacheLimit(modelCacheLimit);
  }, [modelCacheLimit]);

  useEffect(() => {
    if (!handle) return;
    clearStudioResolveCacheForHandle(handle.id);
  }, [handle?.id, queryRevision]);

  useEffect(() => {
    variantsAbortRef.current?.abort();
    if (!handle || !entry || entry.resolveKind !== "blockstate") {
      setResolvedVariants([]);
      setVariantLoadError(null);
      return;
    }
    const abort = new AbortController();
    variantsAbortRef.current = abort;
    setVariantLoadError(null);
    void listVariants(handle, entry.studioModelPath, { signal: abort.signal })
      .then((rows) => {
        if (abort.signal.aborted) return;
        setResolvedVariants(rows);
        setVariantLoadError(null);
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load block variants";
        console.warn("[studio] listVariants failed", entry.id, error);
        setResolvedVariants([]);
        setVariantLoadError(message);
      });
    return () => {
      abort.abort();
    };
  }, [handle, entry?.id, entry?.resolveKind, entry?.studioModelPath, queryRevision]);

  useEffect(() => {
    if (!entryId) return;
    clearSelection();
    setHoveredFace(null);
  }, [entryId, resolvedVariantKey, clearSelection, setHoveredFace]);

  useEffect(() => {
    if (!entryId) return;
    const nextVariants = resolvedVariants.length > 0 ? resolvedVariants : fallbackVariants;
    setState((prev) => ({
      ...prev,
      variants: nextVariants,
      variantLoadError,
    }));
  }, [entryId, resolvedVariants, fallbackVariants, variantLoadError]);

  useEffect(() => {
    resolveAbortRef.current?.abort();
    if (!handle || !entryId) {
      setState(EMPTY);
      return;
    }

    const activeVariants = fallbackVariants;

    if (entry?.resolveKind === "texture") {
      const texturePath = entry.texturePaths[0] ?? entry.studioModelPath ?? entry.sourcePath ?? null;
      const textureMeta = useViewerStore.getState().activeTextureMeta;
      const syntheticModel = texturePath
        ? buildCubeAllPreviewModel(texturePath, textureMeta[texturePath])
        : null;
      if (syntheticModel && texturePath && !textureMeta[texturePath]) {
        setActiveTextureMeta({
          ...textureMeta,
          ...syntheticModel.textureMeta,
        });
      }
      setState({
        renderable: syntheticModel,
        variants: activeVariants,
        variantKey: resolvedVariantKey,
        loading: false,
        error: null,
        variantLoadError: null,
      });
      return;
    }

    const abort = new AbortController();
    resolveAbortRef.current = abort;

    setState((prev) => ({
      ...prev,
      renderable: null,
      variants: activeVariants,
      variantKey: resolvedVariantKey,
      loading: true,
      error: null,
    }));

    const cacheKey =
      handle && entryId
        ? studioResolveKey(handle.id, entryId, resolvedVariantKey)
        : null;
    const cached = cacheKey ? getStudioResolveCache(cacheKey) : undefined;
    if (cached) {
      refreshDirtyTexturesForViewer(handle, modelTexturePaths(cached));
      setActiveTextureMeta(cached.textureMeta);
      setState((prev) => ({
        ...prev,
        renderable: cached,
        variants: activeVariants,
        variantKey: resolvedVariantKey,
        loading: false,
        error: null,
      }));
      return () => {
        abort.abort();
      };
    }

    void (async () => {
      try {
        const model = await resolveWithTimeout(
          resolveCatalogEntry(
            handle,
            entryId,
            "placed",
            resolvedVariantKey ?? null,
            { signal: abort.signal },
          ),
          abort.signal,
          RESOLVE_TIMEOUT_MS,
          "Model resolve timed out — try another entry or reopen the pack",
        );
        if (abort.signal.aborted) return;
        if (cacheKey) setStudioResolveCache(cacheKey, model);
        refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));
        setActiveTextureMeta(model.textureMeta);
        setState((prev) => ({
          ...prev,
          renderable: model,
          variants: activeVariants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: null,
        }));
      } catch (e) {
        if (abort.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          renderable: null,
          variants: activeVariants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to resolve catalog entry",
        }));
      }
    })();

    return () => {
      abort.abort();
    };
  }, [
    handle,
    entryId,
    resolvedVariantKey,
    reloadTick,
    setActiveTextureMeta,
    entry?.resolveKind,
    variantKeysFingerprint,
  ]);

  return { ...state, variants, variantKey: resolvedVariantKey, variantLoadError };
}
