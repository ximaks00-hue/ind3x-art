import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RenderableModel } from "../../ipc/types";
import { faceThreeUvs } from "./uvMapping";

const BLOCK = 1 / 16;

function toWorld(c: number): number {
  return c * BLOCK - 0.5;
}

function faceCenter(
  direction: string,
  from: [number, number, number],
  to: [number, number, number],
): THREE.Vector3 {
  const cx = (from[0] + to[0]) / 2;
  const cy = (from[1] + to[1]) / 2;
  const cz = (from[2] + to[2]) / 2;
  const nudge = 0.002;
  switch (direction) {
    case "down":
      return new THREE.Vector3(toWorld(cx), toWorld(from[1]) - nudge, toWorld(cz));
    case "up":
      return new THREE.Vector3(toWorld(cx), toWorld(to[1]) + nudge, toWorld(cz));
    case "north":
      return new THREE.Vector3(toWorld(cx), toWorld(cy), toWorld(from[2]) - nudge);
    case "south":
      return new THREE.Vector3(toWorld(cx), toWorld(cy), toWorld(to[2]) + nudge);
    case "west":
      return new THREE.Vector3(toWorld(from[0]) - nudge, toWorld(cy), toWorld(cz));
    case "east":
      return new THREE.Vector3(toWorld(to[0]) + nudge, toWorld(cy), toWorld(cz));
    default:
      return new THREE.Vector3(toWorld(cx), toWorld(cy), toWorld(cz));
  }
}

function faceNormal(direction: string): THREE.Vector3 {
  switch (direction) {
    case "down":
      return new THREE.Vector3(0, -1, 0);
    case "up":
      return new THREE.Vector3(0, 1, 0);
    case "north":
      return new THREE.Vector3(0, 0, -1);
    case "south":
      return new THREE.Vector3(0, 0, 1);
    case "west":
      return new THREE.Vector3(-1, 0, 0);
    case "east":
      return new THREE.Vector3(1, 0, 0);
    default:
      return new THREE.Vector3(0, 1, 0);
  }
}

/** UV direction arrows on each face (dev debug). */
export function UvDebugOverlay({ model }: { model: RenderableModel }) {
  const group = useMemo(() => {
    const root = new THREE.Group();
    const rot = model.modelRotation;

    for (const cuboid of model.cuboids) {
      for (const face of cuboid.faces) {
        const center = faceCenter(face.direction, cuboid.from, cuboid.to);
        const normal = faceNormal(face.direction);
        const uvs = faceThreeUvs(face, rot);
        const uDir = new THREE.Vector3(uvs[1][0] - uvs[0][0], uvs[1][1] - uvs[0][1], 0);
        if (uDir.lengthSq() < 1e-6) continue;

        const tangent = new THREE.Vector3().crossVectors(
          normal,
          new THREE.Vector3(0, 1, 0),
        );
        if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
        tangent.normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
        const arrowDir = tangent
          .clone()
          .multiplyScalar(uDir.x)
          .add(bitangent.clone().multiplyScalar(uDir.y))
          .normalize();

        const arrow = new THREE.ArrowHelper(arrowDir, center, 0.12, 0x63ff9a, 0.04, 0.02);
        root.add(arrow);
      }
    }
    return root;
  }, [model]);

  useEffect(() => {
    return () => {
      group.traverse((child) => {
        if (child instanceof THREE.ArrowHelper) {
          child.dispose();
        }
      });
    };
  }, [group]);

  return <primitive object={group} />;
}
