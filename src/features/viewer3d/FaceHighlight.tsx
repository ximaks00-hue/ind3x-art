import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useSelectionStore } from "../../state/selectionStore";
import { buildFaceHighlight, disposeObject3D } from "./buildMesh";

interface FaceHighlightProps {
  model: RenderableModel;
}

export function FaceHighlight({ model }: FaceHighlightProps) {
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const pickHighlight = useEditorStore((s) => s.pickFrom3dHighlight);

  const highlight = useMemo(() => {
    if (!selectedFace || model.cuboids.length === 0) return null;

    const faceNode = buildFaceHighlight(model, selectedFace);
    if (!faceNode) return null;

    if (pickHighlight) {
      faceNode.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material;
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.color.set(0x63ff9a);
            mat.opacity = 0.5;
          }
        }
      });
    }

    const root = new THREE.Group();
    root.add(faceNode);
    root.rotation.x = THREE.MathUtils.degToRad(model.modelRotation.x);
    root.rotation.y = THREE.MathUtils.degToRad(model.modelRotation.y);
    root.rotation.z = THREE.MathUtils.degToRad(model.modelRotation.z);
    return root;
  }, [model, selectedFace, pickHighlight]);

  useEffect(() => {
    return () => {
      if (highlight) disposeObject3D(highlight);
    };
  }, [highlight]);

  if (!highlight) return null;
  return <primitive object={highlight} />;
}
