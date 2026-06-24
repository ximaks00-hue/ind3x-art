import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { drawShapePreview, isShapeToolName } from "../editor/shapePreviewDraw";
import { getTextureCanvas } from "../editor/textureDocument";
import type { RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { buildFaceOverlayNode, disposeObject3D } from "./buildMesh";
import { faceUvRegion } from "./uvMapping";

interface FaceShapePreviewProps {
  model: RenderableModel;
}

export function FaceShapePreview({ model }: FaceShapePreviewProps) {
  const draft = useEditorStore((s) => s.faceShapeDraft);
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const rectFilled = useEditorStore((s) => s.rectFilled);
  const revision = useEditorStore((s) => s.revision);

  const previewRoot = useMemo(() => {
    void revision;
    if (!draft || !isShapeToolName(tool)) return null;

    const cuboid = model.cuboids[draft.cuboidIndex];
    const face = cuboid?.faces[draft.faceIndex];
    const source = getTextureCanvas(draft.texturePath);
    if (!cuboid || !face || !source) return null;

    const region = faceUvRegion(face, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, region.width);
    canvas.height = Math.max(1, region.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    drawShapePreview(
      ctx,
      tool,
      color,
      rectFilled,
      draft.start,
      draft.end,
      region,
      canvas.width,
      canvas.height,
    );

    const map = new THREE.CanvasTexture(canvas);
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.needsUpdate = true;

    const faceNode = buildFaceOverlayNode(
      model,
      draft.cuboidIndex,
      draft.faceIndex,
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    if (!faceNode) {
      map.dispose();
      return null;
    }

    const root = new THREE.Group();
    root.add(faceNode);
    root.rotation.x = THREE.MathUtils.degToRad(model.modelRotation.x);
    root.rotation.y = THREE.MathUtils.degToRad(model.modelRotation.y);
    root.rotation.z = THREE.MathUtils.degToRad(model.modelRotation.z);
    return root;
  }, [draft, tool, color, rectFilled, model, revision]);

  useEffect(() => {
    return () => {
      if (previewRoot) disposeObject3D(previewRoot);
    };
  }, [previewRoot]);

  if (!previewRoot) return null;
  return <primitive object={previewRoot} />;
}
