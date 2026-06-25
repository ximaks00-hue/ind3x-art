import { useEffect, useRef } from "react";
import { Raycaster, Vector2 } from "three";
import { useThree } from "@react-three/fiber";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useEditorStore, TOOL_LABELS } from "../../state/editorStore";
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
import { safeVoid } from "../../lib/safeVoid";
import { ensureTextureDocument, getActiveLayerId } from "../editor/textureDocument";
import { beginBrushStroke, endBrushStroke } from "../editor/paintEngine";
import { isFacePickData, isMiniSceneObject } from "./buildMesh";
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
  const paintGenRef = useRef(0);
  const paintChainRef = useRef(Promise.resolve());
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
        if (isMiniSceneObject(hit.object)) continue;

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

    const enqueuePaint = (
      texturePath: string,
      x: number,
      y: number,
      isStroke: boolean,
    ) => {
      const gen = paintGenRef.current;
      paintChainRef.current = paintChainRef.current.then(async () => {
        if (gen !== paintGenRef.current) return;
        await runPaint(texturePath, x, y, isStroke);
      });
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

    const sameActivePick = (pick: FacePickData) => {
      const active = activePickRef.current;
      if (!active) return true;
      return (
        active.cuboidIndex === pick.cuboidIndex &&
        active.faceIndex === pick.faceIndex &&
        active.face.texture === pick.face.texture
      );
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
        safeVoid(
          ensureTextureDocument(handle, texturePath).then(() => {
            enqueuePaint(texturePath, pixel[0], pixel[1], false);
          }),
          "FaceRaycaster.picker",
        );
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
        enqueuePaint(texturePath, pixel[0], pixel[1], false);
        paintingRef.current = false;
        return;
      }

      beginBrushStroke(texturePath, getActiveLayerId(texturePath) ?? undefined);
      enqueuePaint(texturePath, pixel[0], pixel[1], false);
      canvas.setPointerCapture(event.pointerId);
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
        if (result && sameActivePick(result.pick)) {
          updateShapeDraft(result.pick, result.pixel);
        }
        return;
      }

      if (!paintingRef.current || isClickOnlyTool(tool)) return;

      const texturePath = activeTextureRef.current;
      const activePick = activePickRef.current;
      if (!texturePath || !activePick) return;

      const result = castHit(event);
      if (!result || !sameActivePick(result.pick)) return;

      enqueuePaint(texturePath, result.pixel[0], result.pixel[1], true);
    };

    const endStroke = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      const wasPainting = paintingRef.current;
      const wasShape = Boolean(shapeStartRef.current && isShapeTool(tool));
      if (!wasPainting && !wasShape) return;

      paintGenRef.current += 1;
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
      } else if (texturePath && !isClickOnlyTool(tool) && !isShapeTool(tool)) {
        endBrushStroke(handle, texturePath, `${TOOL_LABELS[tool]} stroke`, true);
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
      if (paintingRef.current || shapeStartRef.current) {
        endStroke(event);
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", onPointerLeave);
    return () => {
      paintGenRef.current += 1;
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
