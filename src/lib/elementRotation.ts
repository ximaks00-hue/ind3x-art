/** Vanilla element rotation rescale: 1 / cos(angle) when rescale is enabled. */
export function elementRescaleFactor(angleDeg: number, rescale: boolean): number {
  if (!rescale || angleDeg === 0) return 1;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  if (Math.abs(cos) < 1e-6) return 1;
  return 1 / cos;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}
