import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import {
  FACE_PICK_KEY,
  type FacePickData,
  type SelectedFace,
  useSelectionStore,
} from "../../state/selectionStore";
import { pickAtPixel, paintAtPixel, paintLineOnTexture } from "../editor/paintAt";
import { ensureTextureDocument } from "../editor/textureDocument";
import { isFacePickData } from "./buildMesh";
import { hitUvToPixel } from "./uvMapping";

interface FaceRaycasterProps {
  model: RenderableModel;
  handle: ProjectHandle;
}

function buildSelection(
  pick: FacePickData,
  hitU: number,
  hitV: number,
  pixel: [number, number],
): SelectedFace {
  return {
    cuboidIndex: pick.cuboidIndex,
    faceIndex: pick.faceIndex,
    direction: pick.face.direction,
    texturePath: pick.face.texture,
    uv: pick.face.uv,
    rotation: pick.face.rotation,
    tintindex: pick.face.tintindex,
    hitUv: [hitU, hitV],
    pixel,
  };
}

export function FaceRaycaster({ model, handle }: FaceRaycasterProps) {
  const { camera, gl, scene } = useThree();
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const setColor = useEditorStore((s) => s.setColor);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);

  const paintingRef = useRef(false);
  const lastPixelRef = useRef<[number, number] | null>(null);
  const lineStartRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const castHit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);

      for (const hit of hits) {
        const pick = hit.object.userData[FACE_PICK_KEY];
        if (!isFacePickData(pick)) continue;

        const hitU = hit.uv?.x ?? 0;
        const hitV = hit.uv?.y ?? 0;
        const pixel = hitUvToPixel(hitU, hitV, pick.face, model.modelRotation);
        return { pick, hitU, hitV, pixel };
      }
      return null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (interactionMode !== "paint" || event.button !== 0) return;

      const result = castHit(event);
      if (!result) return;

      const { pick, hitU, hitV, pixel } = result;
      setSelectedFace(buildSelection(pick, hitU, hitV, pixel));

      if (tool === "picker") {
        void ensureTextureDocument(handle, pick.face.texture).then(() => {
          const picked = pickAtPixel(pick.face.texture, pixel[0], pixel[1]);
          if (picked) setColor(picked);
          bumpRevision();
        });
        return;
      }

      paintingRef.current = true;
      lastPixelRef.current = null;

      if (tool === "line") {
        lineStartRef.current = pixel;
        return;
      }

      void (async () => {
        const last = await paintAtPixel(
          handle,
          pick.face.texture,
          pixel[0],
          pixel[1],
          tool,
          color,
          false,
          null,
        );
        lastPixelRef.current = last;
        bumpRevision();
      })();

      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (
        interactionMode !== "paint" ||
        !paintingRef.current ||
        (event.buttons & 1) === 0
      ) {
        return;
      }
      if (tool === "fill" || tool === "picker" || tool === "line" || tool === "rect") {
        return;
      }

      const result = castHit(event);
      if (!result) return;

      const { pick, pixel } = result;
      void (async () => {
        const last = await paintAtPixel(
          handle,
          pick.face.texture,
          pixel[0],
          pixel[1],
          tool,
          color,
          true,
          lastPixelRef.current,
        );
        lastPixelRef.current = last;
        bumpRevision();
      })();
    };

    const endStroke = (event: PointerEvent) => {
      if (!paintingRef.current) return;

      if (tool === "line" && lineStartRef.current) {
        const result = castHit(event);
        if (result) {
          const { pick, pixel } = result;
          void paintLineOnTexture(
            handle,
            pick.face.texture,
            lineStartRef.current[0],
            lineStartRef.current[1],
            pixel[0],
            pixel[1],
            color,
          ).then(() => bumpRevision());
        }
      }

      paintingRef.current = false;
      lastPixelRef.current = null;
      lineStartRef.current = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", endStroke);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointerleave", endStroke);
    };
  }, [
    camera,
    gl,
    scene,
    interactionMode,
    model,
    handle,
    tool,
    color,
    setSelectedFace,
    setColor,
    bumpRevision,
  ]);

  return null;
}
