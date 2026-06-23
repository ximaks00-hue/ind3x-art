import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { buildFaceHighlight, disposeObject3D } from "./buildMesh";

interface FaceHighlightProps {
  model: RenderableModel;
}

export function FaceHighlight({ model }: FaceHighlightProps) {
  const selectedFace = useSelectionStore((s) => s.selectedFace);

  const highlight = useMemo(() => {
    if (!selectedFace || model.cuboids.length === 0) return null;

    const faceNode = buildFaceHighlight(model, selectedFace);
    if (!faceNode) return null;

    const root = new THREE.Group();
    root.add(faceNode);
    root.rotation.x = THREE.MathUtils.degToRad(model.modelRotation.x);
    root.rotation.y = THREE.MathUtils.degToRad(model.modelRotation.y);
    root.rotation.z = THREE.MathUtils.degToRad(model.modelRotation.z);
    return root;
  }, [model, selectedFace]);

  useEffect(() => {
    return () => {
      if (highlight) disposeObject3D(highlight);
    };
  }, [highlight]);

  if (!highlight) return null;
  return <primitive object={highlight} />;
}
