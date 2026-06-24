import type { PixelChange, Rgba } from "./textureDocument";

export interface MoveBuffer {
  pixels: Map<string, Rgba>;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

type ReadLayerPixel = (x: number, y: number) => Rgba | null;

interface CombinedPixelChange {
  before: Rgba;
  after: Rgba;
}

export function buildMoveSelectionChanges(
  layerId: string,
  buffer: MoveBuffer,
  dx: number,
  dy: number,
  readPixel: ReadLayerPixel,
): PixelChange[] {
  const transparent: Rgba = [0, 0, 0, 0];
  const combined = new Map<string, CombinedPixelChange>();
  const read = (x: number, y: number) => readPixel(x, y) ?? transparent;
  const put = (x: number, y: number, nextAfter: Rgba) => {
    const key = `${x},${y}`;
    const prev = combined.get(key);
    if (prev) {
      prev.after = nextAfter;
      return;
    }
    combined.set(key, {
      before: read(x, y),
      after: nextAfter,
    });
  };

  for (let y = 0; y < buffer.h; y++) {
    for (let x = 0; x < buffer.w; x++) {
      const srcX = buffer.x0 + x;
      const srcY = buffer.y0 + y;
      put(srcX, srcY, transparent);
    }
  }

  for (let y = 0; y < buffer.h; y++) {
    for (let x = 0; x < buffer.w; x++) {
      const dstX = buffer.x0 + dx + x;
      const dstY = buffer.y0 + dy + y;
      const after = buffer.pixels.get(`${x},${y}`);
      if (!after) continue;
      put(dstX, dstY, after);
    }
  }

  const changes: PixelChange[] = [];
  for (const [key, value] of combined) {
    if (
      value.before[0] === value.after[0] &&
      value.before[1] === value.after[1] &&
      value.before[2] === value.after[2] &&
      value.before[3] === value.after[3]
    ) {
      continue;
    }
    const [x, y] = key.split(",").map(Number);
    changes.push({
      x,
      y,
      before: value.before,
      after: value.after,
      layerId,
    });
  }
  return changes;
}
