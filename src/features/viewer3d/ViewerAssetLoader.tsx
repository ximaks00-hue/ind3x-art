import { useEffect } from "react";

import { ipc } from "../../ipc/client";
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

export function ViewerAssetLoader({
  handle,
  selected,
  variantKey,
  linkedModelPath,
  onLoaded,
}: ViewerAssetLoaderProps) {
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setActiveTextureMeta = useViewerStore((s) => s.setActiveTextureMeta);

  useEffect(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      onLoaded({
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
          variants = await ipc.listVariants(handle, selected.path);
          if (resolvedVariantKey == null) {
            resolvedVariantKey = variants[0]?.key;
          }
          if (variants.length > 0 && resolvedVariantKey == null) {
            if (!cancelled) {
              onLoaded({
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

        const [model, linked] = await Promise.all([
          ipc.resolveRenderable(
            handle,
            selected.path,
            selected.kind === "blockstate" ? resolvedVariantKey : undefined,
            linkedModelPath,
          ),
          selected.kind === "texture"
            ? ipc.modelsForTexture(handle, selected.path)
            : Promise.resolve([] as ModelRefInfo[]),
        ]);

        if (cancelled) return;
        setActiveTextureMeta(model.textureMeta);
        onLoaded({
          renderable: model,
          linkedModels: linked,
          variants,
          variantKey: resolvedVariantKey,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        onLoaded({
          renderable: null,
          linkedModels: [],
          variants: [],
          variantKey,
          loading: false,
          error: e instanceof Error ? e.message : "Failed to resolve model",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [handle, selected, variantKey, linkedModelPath, onLoaded, setActiveTextureMeta]);

  return null;
}
