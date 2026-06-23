import type { EditorTool } from "../../state/editorStore";
import type { PixelChange, Rgba } from "./textureDocument";
import {
  getActiveLayerContext,
  getLayerPixel,
  getPixel,
  getTextureCanvas,
} from "./textureDocument";

export function hexToRgba(hex: string): Rgba {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b, 255];
}

export function rgbaToHex([r, g, b]: Rgba): string {
  const part = (n: number) => n.toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbaEqual(a: Rgba, b: Rgba): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function toolColor(tool: EditorTool, color: string): Rgba {
  if (tool === "eraser") return [0, 0, 0, 0];
  return hexToRgba(color);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function lightenPixel(src: Rgba, amount = 30): Rgba {
  return [clamp(src[0] + amount), clamp(src[1] + amount), clamp(src[2] + amount), src[3]];
}

function darkenPixel(src: Rgba, amount = 30): Rgba {
  return [clamp(src[0] - amount), clamp(src[1] - amount), clamp(src[2] - amount), src[3]];
}

function ditherPixel(src: Rgba, x: number, y: number, color: Rgba): Rgba {
  // Ordered 2×2 dither pattern
  const pattern = [
    [0, 2],
    [3, 1],
  ];
  const threshold = pattern[y % 2][x % 2] / 4;
  const t = 0.5; // blend strength
  return t > threshold ? color : src;
}

export function createPixelChange(
  path: string,
  x: number,
  y: number,
  after: Rgba,
  layerId?: string,
): PixelChange | null {
  const layer = getActiveLayerContext(path);
  if (!layer || layer.locked) return null;
  const before = getLayerPixel(path, layer.layerId, x, y);
  if (!before || rgbaEqual(before, after)) return null;
  return { x, y, before, after, layerId: layerId ?? layer.layerId };
}

export function linePixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const points: [number, number][] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return points;
}

function mirrorX(points: [number, number][], width: number): [number, number][] {
  const mirrored = points.map(([x, y]) => [width - 1 - x, y] as [number, number]);
  return [...points, ...mirrored];
}

function rectPixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): [number, number][] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const points: [number, number][] = [];
  const seen = new Set<string>();

  const add = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push([x, y]);
  };

  if (filled) {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        add(x, y);
      }
    }
    return points;
  }

  for (let x = left; x <= right; x += 1) {
    add(x, top);
    add(x, bottom);
  }
  for (let y = top + 1; y < bottom; y += 1) {
    add(left, y);
    add(right, y);
  }
  return points;
}

export function collectStrokeChanges(
  path: string,
  points: [number, number][],
  tool: EditorTool,
  color: string,
  symmetryX = false,
): PixelChange[] {
  const layer = getActiveLayerContext(path);
  if (!layer || layer.locked) return [];

  const allPoints = symmetryX ? mirrorX(points, layer.width) : points;
  const changes: PixelChange[] = [];
  const seen = new Set<string>();
  const fillRgba = hexToRgba(color);

  for (const [x, y] of allPoints) {
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let after: Rgba;
    if (tool === "lighten" || tool === "darken" || tool === "dither") {
      const src = getLayerPixel(path, layer.layerId, x, y) ?? ([0, 0, 0, 255] as Rgba);
      if (tool === "lighten") after = lightenPixel(src);
      else if (tool === "darken") after = darkenPixel(src);
      else after = ditherPixel(src, x, y, fillRgba);
    } else {
      after = toolColor(tool, color);
    }

    const before = getLayerPixel(path, layer.layerId, x, y);
    if (!before || rgbaEqual(before, after)) continue;
    changes.push({ x, y, before, after, layerId: layer.layerId });
  }

  return changes;
}

export function lineToolChanges(
  path: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tool: EditorTool,
  color: string,
  symmetryX = false,
): PixelChange[] {
  return collectStrokeChanges(path, linePixels(x0, y0, x1, y1), tool, color, symmetryX);
}

export function rectToolChanges(
  path: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tool: EditorTool,
  color: string,
  filled: boolean,
  symmetryX = false,
): PixelChange[] {
  return collectStrokeChanges(
    path,
    rectPixels(x0, y0, x1, y1, filled),
    tool,
    color,
    symmetryX,
  );
}

export function floodFillChanges(
  path: string,
  startX: number,
  startY: number,
  fillColor: string,
): PixelChange[] {
  const layer = getActiveLayerContext(path);
  if (!layer || layer.locked) return [];

  const start = getPixel(path, startX, startY);
  if (!start) return [];

  const replacement = hexToRgba(fillColor);
  if (rgbaEqual(start, replacement)) return [];

  const canvas = getTextureCanvas(path);
  if (!canvas) return [];

  const width = canvas.width;
  const height = canvas.height;
  const changes: PixelChange[] = [];
  const stack: [number, number][] = [[startX, startY]];
  const visited = new Set<string>();
  const filled = new Map<string, Rgba>();

  const readPixel = (x: number, y: number): Rgba | null => {
    const key = `${x},${y}`;
    if (filled.has(key)) return filled.get(key)!;
    return getPixel(path, x, y);
  };

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;

    const pixel = readPixel(x, y);
    if (!pixel || !rgbaEqual(pixel, start)) continue;

    visited.add(key);
    const change = createPixelChange(path, x, y, replacement, layer.layerId);
    if (change) {
      changes.push(change);
      filled.set(key, replacement);
    }

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return changes;
}

export function pickColor(path: string, x: number, y: number): string | null {
  const pixel = getPixel(path, x, y);
  if (!pixel || pixel[3] === 0) return null;
  return rgbaToHex(pixel);
}

/** Mid-point ellipse algorithm — returns pixel list on the ellipse perimeter. */
function ellipsePixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const pixels: [number, number][] = [];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a = Math.abs(x1 - x0) / 2;
  const b = Math.abs(y1 - y0) / 2;
  if (a < 0.5 || b < 0.5) {
    pixels.push([Math.round(cx), Math.round(cy)]);
    return pixels;
  }
  const steps = Math.ceil(Math.max(a, b) * 2 * Math.PI);
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const px = Math.round(cx + a * Math.cos(angle));
    const py = Math.round(cy + b * Math.sin(angle));
    const key = `${px},${py}`;
    if (!seen.has(key)) {
      seen.add(key);
      pixels.push([px, py]);
    }
  }
  return pixels;
}

/** Fill interior of ellipse using scanline fill. */
function ellipseFillPixels(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const pixels: [number, number][] = [];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a = Math.abs(x1 - x0) / 2;
  const b = Math.abs(y1 - y0) / 2;
  for (let dy = -Math.floor(b); dy <= Math.ceil(b); dy++) {
    const py = Math.round(cy + dy);
    const halfX = a * Math.sqrt(Math.max(0, 1 - (dy / b) * (dy / b)));
    for (let dx = -Math.floor(halfX); dx <= Math.ceil(halfX); dx++) {
      pixels.push([Math.round(cx + dx), py]);
    }
  }
  return pixels;
}

/**
 * Magic wand: flood-fill by color proximity (tolerance 0–255).
 * Returns the bounding box of selected pixels as a selection rect [x0,y0,x1,y1].
 * If no pixels match, returns null.
 */
export function magicWandSelection(
  path: string,
  startX: number,
  startY: number,
  tolerance: number,
): [number, number, number, number] | null {
  const canvas = getTextureCanvas(path);
  if (!canvas) return null;

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const idx = (x: number, y: number) => (y * width + x) * 4;
  const si = idx(startX, startY);
  const sr = data[si];
  const sg = data[si + 1];
  const sb = data[si + 2];
  const sa = data[si + 3];

  const matches = (x: number, y: number): boolean => {
    const i = idx(x, y);
    return (
      Math.abs(data[i] - sr) <= tolerance &&
      Math.abs(data[i + 1] - sg) <= tolerance &&
      Math.abs(data[i + 2] - sb) <= tolerance &&
      Math.abs(data[i + 3] - sa) <= tolerance
    );
  };

  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  let found = false;

  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    if (!matches(x, y)) continue;
    visited[vi] = 1;
    found = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return found ? [minX, minY, maxX, maxY] : null;
}

export function ellipseToolChanges(
  path: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  filled: boolean,
  symmetryX: boolean,
): PixelChange[] {
  const pts = filled ? ellipseFillPixels(x0, y0, x1, y1) : ellipsePixels(x0, y0, x1, y1);
  return collectStrokeChanges(path, pts, "pencil", color, symmetryX);
}
