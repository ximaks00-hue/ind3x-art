import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useSelectionStore } from "../../state/selectionStore";
import { buildFaceHighlight, disposeObject3D } from "./buildMesh";

interface FaceHighlightProps {
  model: RenderableModel;
  studioMode?: boolean;
}

function wrapHighlight(faceNode: THREE.Object3D, model: RenderableModel): THREE.Group {
  const root = new THREE.Group();
  root.add(faceNode);
  root.rotation.x = THREE.MathUtils.degToRad(model.modelRotation.x);
  root.rotation.y = THREE.MathUtils.degToRad(model.modelRotation.y);
  root.rotation.z = THREE.MathUtils.degToRad(model.modelRotation.z);
  return root;
}

export function FaceHighlight({ model, studioMode = false }: FaceHighlightProps) {
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const hoveredFace = useSelectionStore((s) => s.hoveredFace);
  const pickHighlight = useEditorStore((s) => s.pickFrom3dHighlight);

  const selectedHighlight = useMemo(() => {
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

    return wrapHighlight(faceNode, model);
  }, [model, selectedFace, pickHighlight]);

  const hoverHighlight = useMemo(() => {
    if (!studioMode || !hoveredFace || model.cuboids.length === 0) return null;

    const sameAsSelected =
      selectedFace?.cuboidIndex === hoveredFace.cuboidIndex &&
      selectedFace?.faceIndex === hoveredFace.faceIndex;
    if (sameAsSelected) return null;

    const face = model.cuboids[hoveredFace.cuboidIndex]?.faces[hoveredFace.faceIndex];
    if (!face) return null;

    const faceNode = buildFaceHighlight(model, {
      cuboidIndex: hoveredFace.cuboidIndex,
      faceIndex: hoveredFace.faceIndex,
      direction: face.direction,
      texturePath: face.texture,
      uv: face.uv,
      rotation: face.rotation,
      tintindex: face.tintindex,
      hitUv: [0, 0],
      pixel: [0, 0],
    });
    if (!faceNode) return null;

    faceNode.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (mat instanceof THREE.MeshBasicMaterial) {
          mat.color.set(0x9eb8ff);
          mat.opacity = 0.28;
        }
      }
    });

    return wrapHighlight(faceNode, model);
  }, [model, studioMode, hoveredFace, selectedFace]);

  useEffect(() => {
    return () => {
      if (selectedHighlight) disposeObject3D(selectedHighlight);
    };
  }, [selectedHighlight]);

  useEffect(() => {
    return () => {
      if (hoverHighlight) disposeObject3D(hoverHighlight);
    };
  }, [hoverHighlight]);

  return (
    <>
      {hoverHighlight ? <primitive object={hoverHighlight} /> : null}
      {selectedHighlight ? <primitive object={selectedHighlight} /> : null}
    </>
  );
}
