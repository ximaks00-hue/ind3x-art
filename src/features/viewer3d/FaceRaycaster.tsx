import { useEffect, useRef } from "react";
import { Raycaster, Vector2 } from "three";
import { useThree } from "@react-three/fiber";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import {
  FACE_PICK_KEY,
  type FacePickData,
  type SelectedFace,
  useSelectionStore,
} from "../../state/selectionStore";
import { usePixelWorker } from "../editor/usePixelWorker";
import {
  buildPaintStrokeContext,
  commitPaintShape,
  isClickOnlyTool,
  isShapeTool,
  paintAtTexturePixel,
} from "../editor/paintInteraction";
import { ensureTextureDocument } from "../editor/textureDocument";
import { isFacePickData } from "./buildMesh";
import { hitUvToPixel } from "./uvMapping";

interface FaceRaycasterProps {
  model: RenderableModel;
  handle: ProjectHandle;
  studioMode?: boolean;
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

export function FaceRaycaster({ model, handle, studioMode = false }: FaceRaycasterProps) {
  const { camera, gl, scene } = useThree();
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setSelectedFace = useSelectionStore((s) => s.setSelectedFace);
  const setHoveredFace = useSelectionStore((s) => s.setHoveredFace);
  const tool = useEditorStore((s) => s.tool);
  const setColor = useEditorStore((s) => s.setColor);
  const pushRecentColor = useEditorStore((s) => s.pushRecentColor);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const setFaceShapeDraft = useEditorStore((s) => s.setFaceShapeDraft);
  const pixelWorkerRef = usePixelWorker();

  const paintingRef = useRef(false);
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeTextureRef = useRef<string | null>(null);
  const activePickRef = useRef<FacePickData | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const hoverRafRef = useRef<number | null>(null);
  const pendingHoverEventRef = useRef<PointerEvent | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const castHit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const hits = raycasterRef.current.intersectObjects(scene.children, true);

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

    const paintCtx = (texturePath: string) =>
      buildPaintStrokeContext(handle, texturePath);

    const runPaint = async (
      texturePath: string,
      x: number,
      y: number,
      isStroke: boolean,
    ) => {
      const ctx = paintCtx(texturePath);
      const last = await paintAtTexturePixel(ctx, x, y, isStroke, lastPixelRef.current, {
        pixelWorker: pixelWorkerRef.current,
        callbacks: {
          onColorPicked: (hex) => {
            setColor(hex);
            pushRecentColor(hex);
          },
          onComplete: () => bumpRevision(),
        },
      });
      lastPixelRef.current = last;
    };

    const updateShapeDraft = (pick: FacePickData, pixel: [number, number]) => {
      const start = shapeStartRef.current;
      if (!start) return;
      setFaceShapeDraft({
        cuboidIndex: pick.cuboidIndex,
        faceIndex: pick.faceIndex,
        texturePath: pick.face.texture,
        start: [start.x, start.y],
        end: pixel,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (interactionMode !== "paint" || event.button !== 0) return;

      const result = castHit(event);
      if (!result) return;

      const { pick, hitU, hitV, pixel } = result;
      const texturePath = pick.face.texture;
      setSelectedFace(buildSelection(pick, hitU, hitV, pixel));
      activeTextureRef.current = texturePath;
      activePickRef.current = pick;

      if (tool === "picker") {
        void ensureTextureDocument(handle, texturePath).then(() => {
          void runPaint(texturePath, pixel[0], pixel[1], false);
        });
        return;
      }

      paintingRef.current = true;
      lastPixelRef.current = null;

      if (isShapeTool(tool)) {
        shapeStartRef.current = { x: pixel[0], y: pixel[1] };
        updateShapeDraft(pick, pixel);
        return;
      }

      if (isClickOnlyTool(tool)) {
        void runPaint(texturePath, pixel[0], pixel[1], false);
        paintingRef.current = false;
        return;
      }

      void runPaint(texturePath, pixel[0], pixel[1], false);
      event.stopPropagation();
    };

    const applyStudioHover = (event: PointerEvent) => {
      const hoverHit = castHit(event);
      if (hoverHit) {
        setHoveredFace({
          cuboidIndex: hoverHit.pick.cuboidIndex,
          faceIndex: hoverHit.pick.faceIndex,
        });
      } else {
        setHoveredFace(null);
      }
    };

    const scheduleStudioHover = (event: PointerEvent) => {
      pendingHoverEventRef.current = event;
      if (hoverRafRef.current !== null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const pending = pendingHoverEventRef.current;
        if (!pending) return;
        applyStudioHover(pending);
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (studioMode && (event.buttons & 1) === 0) {
        scheduleStudioHover(event);
      }

      if (interactionMode !== "paint" || (event.buttons & 1) === 0) return;

      if (isShapeTool(tool) && shapeStartRef.current) {
        const result = castHit(event);
        if (result) updateShapeDraft(result.pick, result.pixel);
        return;
      }

      if (!paintingRef.current || isClickOnlyTool(tool)) return;

      const result = castHit(event);
      if (!result) return;

      const { pick, pixel } = result;
      void runPaint(pick.face.texture, pixel[0], pixel[1], true);
    };

    const endStroke = (event: PointerEvent) => {
      const texturePath = activeTextureRef.current;
      const shapeStart = shapeStartRef.current;

      if (shapeStart && texturePath && isShapeTool(tool)) {
        const result = castHit(event);
        if (result) {
          const ctx = paintCtx(texturePath);
          commitPaintShape(ctx, shapeStart, {
            x: result.pixel[0],
            y: result.pixel[1],
          });
          bumpRevision();
        }
      }

      paintingRef.current = false;
      lastPixelRef.current = null;
      shapeStartRef.current = null;
      activeTextureRef.current = null;
      activePickRef.current = null;
      setFaceShapeDraft(null);
    };

    const onPointerLeave = (event: PointerEvent) => {
      if (studioMode) setHoveredFace(null);
      endStroke(event);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      pendingHoverEventRef.current = null;
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      setFaceShapeDraft(null);
      if (studioMode) setHoveredFace(null);
    };
  }, [
    camera,
    gl,
    scene,
    interactionMode,
    model,
    handle,
    tool,
    setSelectedFace,
    setHoveredFace,
    studioMode,
    setColor,
    pushRecentColor,
    bumpRevision,
    setFaceShapeDraft,
    pixelWorkerRef,
  ]);

  return null;
}
