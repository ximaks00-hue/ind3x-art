import { useEffect, useState } from "react";
import type * as THREE from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { buildModelGroup, disposeObject3D } from "./buildMesh";
import { miniSceneGhostOffsets, type MiniSceneSize } from "./miniSceneLayout";

interface MiniSceneTilesProps {
  model: RenderableModel;
  handle: ProjectHandle;
  size: MiniSceneSize;
  studioMode?: boolean;
  preferredDisplaySlot?: string;
}

/** Non-interactive copies of the active block — one mesh build, shared via clone(). */
export function MiniSceneTiles({
  model,
  handle,
  size,
  studioMode = false,
  preferredDisplaySlot,
}: MiniSceneTilesProps) {
  const [template, setTemplate] = useState<THREE.Group | null>(null);
  const offsets = miniSceneGhostOffsets(size);

  useEffect(() => {
    let cancelled = false;
    void buildModelGroup(model, handle, preferredDisplaySlot, studioMode).then((built) => {
      if (cancelled) {
        disposeObject3D(built);
        return;
      }
      setTemplate((prev) => {
        if (prev) disposeObject3D(prev);
        return built;
      });
    });
    return () => {
      cancelled = true;
      setTemplate((prev) => {
        if (prev) disposeObject3D(prev);
        return null;
      });
    };
  }, [model, handle, preferredDisplaySlot, studioMode]);

  if (!template) return null;

  return (
    <group name="mini-scene-tiles">
      {offsets.map(([x, y, z]) => (
        <group key={`${x}:${y}:${z}`} position={[x, y, z]}>
          <primitive object={template.clone()} />
        </group>
      ))}
    </group>
  );
}
