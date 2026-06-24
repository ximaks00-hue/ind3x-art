const DIRECTION_LABELS: Record<string, string> = {
  up: "Top",
  down: "Bottom",
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

export function formatFaceDirection(direction: string): string {
  return DIRECTION_LABELS[direction] ?? direction;
}

export function textureBasename(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.(png|tga)$/i, "");
}
