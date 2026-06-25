import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { buildFaceHighlight, buildFaceOverlayNode, disposeObject3D, wrapModelPresentation } from "./buildMesh";

interface FaceHighlightProps {
  model: RenderableModel;
  studioMode?: boolean;
  preferredDisplaySlot?: string;
}

export function FaceHighlight({
  model,
  studioMode = false,
  preferredDisplaySlot,
}: FaceHighlightProps) {
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const hoveredFace = useSelectionStore((s) => s.hoveredFace);
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const pickHighlight = useEditorStore((s) => s.pickFrom3dHighlight);
  const activeTextureMeta = useViewerStore((s) => s.activeTextureMeta);

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

    return wrapModelPresentation(faceNode, model, preferredDisplaySlot);
  }, [model, selectedFace, pickHighlight, preferredDisplaySlot]);

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

    return wrapModelPresentation(faceNode, model, preferredDisplaySlot);
  }, [model, studioMode, hoveredFace, selectedFace, preferredDisplaySlot]);

  const pixelGridOverlay = useMemo(() => {
    if (!studioMode || interactionMode !== "paint") return null;
    const target = selectedFace ?? (hoveredFace ? {
      cuboidIndex: hoveredFace.cuboidIndex,
      faceIndex: hoveredFace.faceIndex,
      texturePath:
        model.cuboids[hoveredFace.cuboidIndex]?.faces[hoveredFace.faceIndex]?.texture ?? "",
      uv: model.cuboids[hoveredFace.cuboidIndex]?.faces[hoveredFace.faceIndex]?.uv ?? [0, 0, 16, 16],
    } : null);
    if (!target || !target.texturePath) return null;

    const uvWidth = Math.max(1, Math.abs(target.uv[2] - target.uv[0]));
    const uvHeight = Math.max(1, Math.abs(target.uv[3] - target.uv[1]));
    const texMeta = activeTextureMeta[target.texturePath];
    const texWidth = Math.max(1, texMeta?.width ?? uvWidth);
    const texHeight = Math.max(1, texMeta?.height ?? uvHeight);
    const repeatsX = Math.max(1, Math.round(uvWidth));
    const repeatsY = Math.max(1, Math.round(uvHeight));

    const canvas = document.createElement("canvas");
    canvas.width = repeatsX;
    canvas.height = repeatsY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, repeatsX, repeatsY);
    ctx.strokeStyle = "rgba(160, 190, 255, 0.55)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= repeatsX; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, repeatsY);
      ctx.stroke();
    }
    for (let y = 0; y <= repeatsY; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(repeatsX, y + 0.5);
      ctx.stroke();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatsX / texWidth, repeatsY / texHeight);
    map.magFilter = THREE.NearestFilter;
    map.minFilter = THREE.NearestFilter;
    map.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const node = buildFaceOverlayNode(model, target.cuboidIndex, target.faceIndex, material);
    if (!node) {
      material.dispose();
      map.dispose();
      return null;
    }
    return wrapModelPresentation(node, model, preferredDisplaySlot);
  }, [studioMode, interactionMode, selectedFace, hoveredFace, model, activeTextureMeta, preferredDisplaySlot]);

  useEffect(() => {
    return () => {
      if (selectedHighlight) disposeObject3D(selectedHighlight, { disposeMaps: true });
    };
  }, [selectedHighlight]);

  useEffect(() => {
    return () => {
      if (hoverHighlight) disposeObject3D(hoverHighlight, { disposeMaps: true });
    };
  }, [hoverHighlight]);

  useEffect(() => {
    return () => {
      if (pixelGridOverlay) disposeObject3D(pixelGridOverlay, { disposeMaps: true });
    };
  }, [pixelGridOverlay]);

  return (
    <>
      {hoverHighlight ? <primitive object={hoverHighlight} /> : null}
      {selectedHighlight ? <primitive object={selectedHighlight} /> : null}
      {pixelGridOverlay ? <primitive object={pixelGridOverlay} /> : null}
    </>
  );
}
