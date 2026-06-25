export type MiniSceneSize = 2 | 3;

/** World-space tile offsets (block units) for ghost copies; center (0,0,0) is the interactive block. */
export function miniSceneGhostOffsets(size: MiniSceneSize): [number, number, number][] {
  const origin = Math.floor(size / 2);
  const offsets: [number, number, number][] = [];
  for (let dz = 0; dz < size; dz += 1) {
    for (let dx = 0; dx < size; dx += 1) {
      const x = dx - origin;
      const z = dz - origin;
      if (x === 0 && z === 0) continue;
      offsets.push([x, 0, z]);
    }
  }
  return offsets;
}

export function miniSceneLabel(size: MiniSceneSize): string {
  return `Test scene ${size}×${size}`;
}
