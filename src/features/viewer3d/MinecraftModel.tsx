import { useEffect, useState } from "react";
import type * as THREE from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useViewerStore } from "../../state/viewerStore";
import { buildModelGroup, disposeObject3D } from "./buildMesh";

interface MinecraftModelProps {
  model: RenderableModel;
  handle: ProjectHandle;
}

export function MinecraftModel({ model, handle }: MinecraftModelProps) {
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const displaySlot = useViewerStore((s) => s.displaySlot);

  useEffect(() => {
    let cancelled = false;

    void buildModelGroup(model, handle, displaySlot).then((built) => {
      if (cancelled) {
        disposeObject3D(built);
        return;
      }
      setGroup((prev) => {
        if (prev) disposeObject3D(prev);
        return built;
      });
    });

    return () => {
      cancelled = true;
      setGroup((prev) => {
        if (prev) disposeObject3D(prev);
        return null;
      });
    };
  }, [model, handle, displaySlot]);

  if (!group) return null;
  return <primitive object={group} />;
}
