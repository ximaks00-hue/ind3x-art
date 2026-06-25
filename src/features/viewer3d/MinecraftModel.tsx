import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useViewerStore } from "../../state/viewerStore";
import {
  buildModelGroup,
  disposeObject3D,
  syncBiomeTints,
  syncModelGroupTextures,
} from "./buildMesh";
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
  const groupRef = useRef<THREE.Group | null>(null);
  const onMeshStateRef = useRef(onMeshState);
  onMeshStateRef.current = onMeshState;

  const storeDisplaySlot = useViewerStore((s) => s.displaySlot);
  const textureReloadTick = useViewerStore((s) => s.textureReloadTick);
  const displaySlot = studioMode ? preferredDisplaySlot : (preferredDisplaySlot ?? storeDisplaySlot);

  useEffect(() => {
    let cancelled = false;
    onMeshStateRef.current?.("loading", null);
    refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));

    void buildModelGroup(model, handle, displaySlot, studioMode)
      .then((built) => {
        if (cancelled) {
          disposeObject3D(built);
          return;
        }
        if (groupRef.current) disposeObject3D(groupRef.current);
        groupRef.current = built;
        setGroup(built);
        onMeshStateRef.current?.("ready", null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (groupRef.current) {
          disposeObject3D(groupRef.current);
          groupRef.current = null;
        }
        setGroup(null);
        const message =
          error instanceof Error ? error.message : "Failed to build 3D preview";
        onMeshStateRef.current?.("error", message);
      });

    return () => {
      cancelled = true;
      if (groupRef.current) {
        disposeObject3D(groupRef.current);
        groupRef.current = null;
      }
      setGroup(null);
    };
  }, [model, handle, displaySlot, studioMode]);

  useEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));
    syncBiomeTints(root);
    void syncModelGroupTextures(root, handle, model);
  }, [textureReloadTick, handle, model]);

  if (!group) return null;
  return <primitive object={group} />;
}

