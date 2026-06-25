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

function bilinearUv(
  p00: [number, number],
  p10: [number, number],
  p11: [number, number],
  p01: [number, number],
  s: number,
  t: number,
): [number, number] {
  const u =
    (1 - s) * (1 - t) * p00[0] +
    s * (1 - t) * p10[0] +
    s * t * p11[0] +
    (1 - s) * t * p01[0];
  const v =
    (1 - s) * (1 - t) * p00[1] +
    s * (1 - t) * p10[1] +
    s * t * p11[1] +
    (1 - s) * t * p01[1];
  return [u, v];
}

/** Invert bilinear quad mapping (s,t) ∈ [0,1]² → texture UV. */
function solveQuadSt(
  hitU: number,
  hitV: number,
  corners: [number, number][],
): [number, number] {
  const [p00, p10, p11, p01] = corners;
  let s = 0.5;
  let t = 0.5;
  for (let i = 0; i < 12; i += 1) {
    const [u, v] = bilinearUv(p00, p10, p11, p01, s, t);
    const du = u - hitU;
    const dv = v - hitV;
    if (du * du + dv * dv < 1e-10) break;

    const duDs = (1 - t) * (p10[0] - p00[0]) + t * (p11[0] - p01[0]);
    const duDt = (1 - s) * (p01[0] - p00[0]) + s * (p11[0] - p10[0]);
    const dvDs = (1 - t) * (p10[1] - p00[1]) + t * (p11[1] - p01[1]);
    const dvDt = (1 - s) * (p01[1] - p00[1]) + s * (p11[1] - p10[1]);
    const det = duDs * dvDt - duDt * dvDs;
    if (Math.abs(det) < 1e-12) break;

    s -= (du * dvDt - dv * duDt) / det;
    t -= (dv * duDs - du * dvDt) / det;
    s = Math.min(1, Math.max(0, s));
    t = Math.min(1, Math.max(0, t));
  }
  return [s, t];
}

export function hitUvToPixel(
  hitU: number,
  hitV: number,
  face: RenderFace,
  modelRotation?: ModelRotation,
): [number, number] {
  const corners = faceThreeUvs(face, modelRotation);
  const [s, t] = solveQuadSt(hitU, hitV, corners);

  const rotation = effectiveFaceRotation(face, modelRotation);
  const [ms, mt] = inverseRotateST(s, t, rotation);

  const [u1, v1, u2, v2] = face.uv;
  const uMin = Math.min(u1, u2);
  const uMax = Math.max(u1, u2);
  const vMin = Math.min(v1, v2);
  const vMax = Math.max(v1, v2);

  const pixelU = uMin + ms * (uMax - uMin);
  const pixelV = vMin + mt * (vMax - vMin);
  const pxU = Math.floor(pixelU);
  const pxV = Math.floor(pixelV);
  return [
    Math.min(Math.max(pxU, uMin), Math.max(uMin, uMax - 1)),
    Math.min(Math.max(pxV, vMin), Math.max(vMin, vMax - 1)),
  ];
}

/** Map 2D face-canvas coordinates to texture pixel (matches 3D hitUvToPixel). */
export function faceCanvasToTexturePixel(
  localX: number,
  localY: number,
  canvasW: number,
  canvasH: number,
  face: RenderFace,
  modelRotation?: ModelRotation,
): [number, number] {
  const ms = localX / canvasW;
  const mt = localY / canvasH;
  const rotation = effectiveFaceRotation(face, modelRotation);
  const [rs, rt] = inverseRotateST(ms, mt, rotation);

  const [u1, v1, u2, v2] = face.uv;
  const uMin = Math.min(u1, u2);
  const uMax = Math.max(u1, u2);
  const vMin = Math.min(v1, v2);
  const vMax = Math.max(v1, v2);

  const pixelU = uMin + rs * (uMax - uMin);
  const pixelV = vMin + rt * (vMax - vMin);
  const pxU = Math.floor(pixelU);
  const pxV = Math.floor(pixelV);
  return [
    Math.min(Math.max(pxU, uMin), Math.max(uMin, uMax - 1)),
    Math.min(Math.max(pxV, vMin), Math.max(vMin, vMax - 1)),
  ];
}

/** Draw face UV region with rotation applied (matches 3D orientation). */
export function drawRotatedFaceRegion(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  face: RenderFace,
  textureWidth: number,
  textureHeight: number,
  destW: number,
  destH: number,
  modelRotation?: ModelRotation,
): void {
  const region = faceUvRegion(face, textureWidth, textureHeight);
  const rotation = effectiveFaceRotation(face, modelRotation);
  const steps = (rotation % 360) / 90;

  ctx.save();
  ctx.translate(destW / 2, destH / 2);
  ctx.rotate((steps * Math.PI) / 2);
  const swap = steps % 2 === 1;
  const drawW = swap ? destH : destW;
  const drawH = swap ? destW : destH;
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    -drawW / 2,
    -drawH / 2,
    drawW,
    drawH,
  );
  ctx.restore();
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
