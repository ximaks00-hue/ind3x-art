import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { FACE_PICK_KEY, useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { isFacePickData } from "./buildMesh";

/** Double-click a face in orbit mode to zoom the camera toward it. */
export function FaceZoomHandler() {
  const { camera, gl, scene } = useThree();
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const requestFaceZoom = useViewerStore((s) => s.requestFaceZoom);

  useEffect(() => {
    const canvas = gl.domElement;

    const onDblClick = (event: MouseEvent) => {
      if (interactionMode !== "orbit") return;

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

        const point = hit.point;
        const normal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 1, 0);
        normal.transformDirection(hit.object.matrixWorld);

        const target: [number, number, number] = [point.x, point.y, point.z];
        const dist = 0.55;
        const position: [number, number, number] = [
          point.x + normal.x * dist,
          point.y + normal.y * dist,
          point.z + normal.z * dist,
        ];
        requestFaceZoom(position, target);
        event.preventDefault();
        return;
      }
    };

    canvas.addEventListener("dblclick", onDblClick);
    return () => canvas.removeEventListener("dblclick", onDblClick);
  }, [camera, gl, scene, interactionMode, requestFaceZoom]);

  return null;
}
