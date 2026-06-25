import { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "three";
import type * as THREE from "three";

import { safeVoid } from "../../lib/safeVoid";
import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useViewerStore } from "../../state/viewerStore";
import {
  buildModelGroup,
  cloneModelGroupShared,
  disposeGhostModelGroup,
  disposeObject3D,
  stripFacePickData,
  syncBiomeTints,
  syncModelGroupTextures,
} from "./buildMesh";
import { miniSceneGhostOffsets, type MiniSceneSize } from "./miniSceneLayout";
import { modelTexturePaths, refreshDirtyTexturesForViewer } from "./viewerTextureSync";

interface MiniSceneTilesProps {
  model: RenderableModel;
  handle: ProjectHandle;
  size: MiniSceneSize;
  studioMode?: boolean;
  preferredDisplaySlot?: string;
}

/** Non-interactive copies of the active block — one mesh build, shared GPU resources. */
export function MiniSceneTiles({
  model,
  handle,
  size,
  studioMode = false,
  preferredDisplaySlot,
}: MiniSceneTilesProps) {
  const [tileRoots, setTileRoots] = useState<Group[]>([]);
  const templateRef = useRef<THREE.Group | null>(null);
  const textureReloadTick = useViewerStore((s) => s.textureReloadTick);
  const offsets = useMemo(() => miniSceneGhostOffsets(size), [size]);

  useEffect(() => {
    const controller = new AbortController();
    let builtTiles: Group[] = [];

    safeVoid(
      buildModelGroup(model, handle, preferredDisplaySlot, studioMode).then((built) => {
        if (controller.signal.aborted) {
          disposeObject3D(built);
          return;
        }
        stripFacePickData(built);
        templateRef.current = built;
        builtTiles = offsets.map(([x, y, z]) => {
          const root = new Group();
          root.name = `mini-scene-tile-${x}:${y}:${z}`;
          root.position.set(x, y, z);
          root.add(cloneModelGroupShared(built));
          return root;
        });
        setTileRoots(builtTiles);
      }),
      "MiniSceneTiles.build",
    );

    return () => {
      controller.abort();
      for (const root of builtTiles) {
        disposeGhostModelGroup(root);
      }
      if (templateRef.current) {
        disposeObject3D(templateRef.current);
        templateRef.current = null;
      }
      setTileRoots([]);
    };
  }, [model, handle, preferredDisplaySlot, studioMode, offsets]);

  useEffect(() => {
    const template = templateRef.current;
    if (!template) return;
    refreshDirtyTexturesForViewer(handle, modelTexturePaths(model));
    syncBiomeTints(template);
    void syncModelGroupTextures(template, handle, model);
  }, [textureReloadTick, handle, model]);

  if (tileRoots.length === 0) return null;

  return (
    <group name="mini-scene-tiles">
      {tileRoots.map((tile) => (
        <primitive key={tile.name} object={tile} />
      ))}
    </group>
  );
}
