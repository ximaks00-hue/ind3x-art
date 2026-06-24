import { useEffect, useState } from "react";
import type * as THREE from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useViewerStore } from "../../state/viewerStore";
import { buildModelGroup, disposeObject3D } from "./buildMesh";
import { modelTexturePaths, refreshDirtyTexturesForViewer } from "./viewerTextureSync";

export type MeshBuildState = "loading" | "ready" | "error";

interface MinecraftModelProps {
  model: RenderableModel;
  handle: ProjectHandle;
  studioMode?: boolean;
  preferredDisplaySlot?: string;
  onMeshState?: (state: MeshBuildState, error?: string | null) => void;
}

export function MinecraftModel({
  model,
  handle,
  studioMode = false,
  preferredDisplaySlot,
  onMeshState,
}: MinecraftModelProps) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const storeDisplaySlot = useViewerStore((s) => s.displaySlot);
  const textureReloadTick = useViewerStore((s) => s.textureReloadTick);
  const displaySlot = studioMode ? preferredDisplaySlot : (preferredDisplaySlot ?? storeDisplaySlot);

  useEffect(() => {
    let cancelled = false;
    onMeshState?.("loading", null);
    refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));

    void buildModelGroup(model, handle, displaySlot, studioMode)
      .then((built) => {
        if (cancelled) {
          disposeObject3D(built);
          return;
        }
        setGroup((prev) => {
          if (prev) disposeObject3D(prev);
          return built;
        });
        onMeshState?.("ready", null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setGroup((prev) => {
          if (prev) disposeObject3D(prev);
          return null;
        });
        const message =
          error instanceof Error ? error.message : "Failed to build 3D preview";
        onMeshState?.("error", message);
      });

    return () => {
      cancelled = true;
      setGroup((prev) => {
        if (prev) disposeObject3D(prev);
        return null;
      });
    };
  }, [model, handle, displaySlot, studioMode, textureReloadTick, onMeshState]);

  if (!group) return null;
  return <primitive object={group} />;
}
