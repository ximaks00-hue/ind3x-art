/** Standard Minecraft-style cross net (column, row) in a 4×3 grid. */
export const CUBE_UNFOLD_GRID_COLS = 4;
export const CUBE_UNFOLD_GRID_ROWS = 3;

export const CUBE_FACE_SLOTS: Record<string, { col: number; row: number }> = {
  up: { col: 1, row: 0 },
  north: { col: 1, row: 1 },
  west: { col: 0, row: 1 },
  east: { col: 2, row: 1 },
  south: { col: 3, row: 1 },
  down: { col: 1, row: 2 },
};

export const CUBE_FACE_ORDER = ["up", "north", "west", "east", "south", "down"] as const;

export type CubeFaceDirection = (typeof CUBE_FACE_ORDER)[number];

export function isCubeFaceDirection(value: string): value is CubeFaceDirection {
  return value in CUBE_FACE_SLOTS;
}

export function unfoldCellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

export function directionForUnfoldCell(col: number, row: number): CubeFaceDirection | null {
  for (const direction of CUBE_FACE_ORDER) {
    const slot = CUBE_FACE_SLOTS[direction];
    if (slot.col === col && slot.row === row) return direction;
  }
  return null;
}
