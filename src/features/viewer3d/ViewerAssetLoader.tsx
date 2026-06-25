import { useEffect, useRef } from "react";

import { ipc } from "../../ipc/client";
import { withAbortableIpc } from "../../ipc/abortable";
import { resolveWithTimeout } from "../../lib/resolveWithTimeout";
import { safeVoid } from "../../lib/safeVoid";
import type {
  AssetEntry,
  ModelRefInfo,
  ProjectHandle,
  RenderableModel,
  VariantKey,
} from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";

export interface ViewerAssetState {
  renderable: RenderableModel | null;
  linkedModels: ModelRefInfo[];
  variants: VariantKey[];
  variantKey: string | undefined;
  loading: boolean;
  error: string | null;
}

interface ViewerAssetLoaderProps {
  handle: ProjectHandle;
  selected: AssetEntry;
  /** When set, resolves that blockstate variant; otherwise picks the first. */
  variantKey?: string;
  /** When viewing a texture, resolve this linked model path instead of auto-pick. */
  linkedModelPath?: string;
  onLoaded: (state: ViewerAssetState) => void;
}

const RESOLVE_TIMEOUT_MS = 45_000;

export function ViewerAssetLoader({
  handle,
  selected,
  variantKey,
  linkedModelPath,
  onLoaded,
}: ViewerAssetLoaderProps) {
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setActiveTextureMeta = useViewerStore((s) => s.setActiveTextureMeta);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    clearSelection();
  }, [clearSelection, handle.id, selected.path]);

  useEffect(() => {
    const abort = new AbortController();

    async function load() {
      onLoadedRef.current({
        renderable: null,
        linkedModels: [],
        variants: [],
        variantKey,
        loading: true,
        error: null,
      });

      try {
        let variants: VariantKey[] = [];
        let resolvedVariantKey = variantKey;

        if (selected.kind === "blockstate") {
          variants = await withAbortableIpc(abort.signal, (ipcRequestId) =>
            ipc.listVariants(handle, selected.path, ipcRequestId),
          );
          if (resolvedVariantKey == null) {
            resolvedVariantKey = variants[0]?.key;
          }
          if (variants.length > 0 && resolvedVariantKey == null) {
            if (!abort.signal.aborted) {
              onLoadedRef.current({
                renderable: null,
                linkedModels: [],
                variants,
                variantKey: undefined,
                loading: false,
                error: "No variant key resolved for blockstate",
              });
            }
            return;
          }
        }

        const [model, linked] = await resolveWithTimeout(
          Promise.all([
            withAbortableIpc(abort.signal, (ipcRequestId) =>
              ipc.resolveRenderable(
                handle,
                selected.path,
                selected.kind === "blockstate" ? resolvedVariantKey : undefined,
                linkedModelPath,
                ipcRequestId,
              ),
            ),
            selected.kind === "texture"
              ? withAbortableIpc(abort.signal, (ipcRequestId) =>
                  ipc.modelsForTexture(handle, selected.path, ipcRequestId),
                )
              : Promise.resolve([] as ModelRefInfo[]),
          ]),
          abort.signal,
          RESOLVE_TIMEOUT_MS,
          "Model resolve timed out — try another asset or reopen the pack",
        );

        if (abort.signal.aborted) return;
        setActiveTextureMeta(model.textureMeta);
        onLoadedRef.current({
          renderable: model,
          linkedModels: linked,
          variants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (abort.signal.aborted) return;
        onLoadedRef.current({
          renderable: null,
          linkedModels: [],
          variants: [],
          variantKey,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to resolve model",
        });
      }
    }

    safeVoid(load(), "ViewerAssetLoader");
    return () => {
      abort.abort();
    };
  }, [handle, selected, variantKey, linkedModelPath, setActiveTextureMeta]);

  return null;
}
