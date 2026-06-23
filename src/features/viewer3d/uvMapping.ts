import type { ModelRotation, RenderFace } from "../../ipc/types";

/** Extra UV rotation from blockstate x/y when uvlock is disabled. */
export function blockUvRotationAddition(
  direction: string,
  modelRotation: ModelRotation,
): number {
  if (modelRotation.uvlock) return 0;
  switch (direction) {
    case "down":
    case "up":
      return modelRotation.x;
    case "north":
    case "south":
    case "east":
    case "west":
      return modelRotation.y;
    default:
      return 0;
  }
}

export function effectiveFaceRotation(
  face: RenderFace,
  modelRotation?: ModelRotation,
): number {
  const extra = modelRotation
    ? blockUvRotationAddition(face.direction, modelRotation)
    : 0;
  return (face.rotation + extra + 360) % 360;
}

export function faceThreeUvs(
  face: RenderFace,
  modelRotation?: ModelRotation,
): [number, number][] {
  const [u1, v1, u2, v2] = face.uv;
  const uMin = Math.min(u1, u2) / 16;
  const uMax = Math.max(u1, u2) / 16;
  const vMin = Math.min(v1, v2) / 16;
  const vMax = Math.max(v1, v2) / 16;

  const base: [number, number][] = [
    [uMin, 1 - vMax],
    [uMax, 1 - vMax],
    [uMax, 1 - vMin],
    [uMin, 1 - vMin],
  ];

  const rotation = effectiveFaceRotation(face, modelRotation);
  const steps = (rotation % 360) / 90;
  if (steps === 0) return base;
  const rotated = [...base];
  for (let i = 0; i < steps; i += 1) {
    rotated.unshift(rotated.pop()!);
  }
  return rotated;
}

function inverseRotateST(s: number, t: number, rotation: number): [number, number] {
  const steps = (((rotation % 360) + 360) % 360) / 90;
  let rs = s;
  let rt = t;
  for (let i = 0; i < (4 - steps) % 4; i += 1) {
    [rs, rt] = [rt, 1 - rs];
  }
  return [rs, rt];
}

export function hitUvToPixel(
  hitU: number,
  hitV: number,
  face: RenderFace,
  modelRotation?: ModelRotation,
): [number, number] {
  const corners = faceThreeUvs(face, modelRotation);
  const uMinT = Math.min(...corners.map(([u]) => u));
  const uMaxT = Math.max(...corners.map(([u]) => u));
  const vMinT = Math.min(...corners.map(([, v]) => v));
  const vMaxT = Math.max(...corners.map(([, v]) => v));

  const spanU = uMaxT - uMinT || 1;
  const spanV = vMaxT - vMinT || 1;
  const s = (hitU - uMinT) / spanU;
  const t = (hitV - vMinT) / spanV;

  const rotation = effectiveFaceRotation(face, modelRotation);
  const [ms, mt] = inverseRotateST(
    Math.min(1, Math.max(0, s)),
    Math.min(1, Math.max(0, t)),
    rotation,
  );

  const [u1, v1, u2, v2] = face.uv;
  const uMin = Math.min(u1, u2);
  const uMax = Math.max(u1, u2);
  const vMin = Math.min(v1, v2);
  const vMax = Math.max(v1, v2);

  const pixelU = uMin + ms * (uMax - uMin);
  const pixelV = vMin + mt * (vMax - vMin);
  return [Math.floor(pixelU), Math.floor(pixelV)];
}

export function faceUvRegion(
  face: RenderFace,
  textureWidth: number,
  textureHeight: number,
): { x: number; y: number; width: number; height: number } {
  const [u1, v1, u2, v2] = face.uv;
  const uMin = Math.min(u1, u2);
  const uMax = Math.max(u1, u2);
  const vMin = Math.min(v1, v2);
  const vMax = Math.max(v1, v2);

  const scaleX = textureWidth / 16;
  const scaleY = textureHeight / 16;

  return {
    x: Math.round(uMin * scaleX),
    y: Math.round(vMin * scaleY),
    width: Math.max(1, Math.round((uMax - uMin) * scaleX)),
    height: Math.max(1, Math.round((vMax - vMin) * scaleY)),
  };
}
