import { tickAnimatedTextures } from "./textureLoader";

let subscribers = 0;
let rafId = 0;
let lastTime = 0;

function frame(now: number): void {
  rafId = requestAnimationFrame(frame);
  const delta = lastTime > 0 ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  if (delta > 0) tickAnimatedTextures(delta);
}

function ensureLoop(): void {
  if (rafId !== 0) return;
  lastTime = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  if (rafId === 0) return;
  cancelAnimationFrame(rafId);
  rafId = 0;
  lastTime = 0;
}

/** Single global animation tick — avoids duplicate work when multiple Scene3D canvases mount. */
export function subscribeTextureAnimation(): () => void {
  subscribers += 1;
  ensureLoop();
  return () => {
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) stopLoop();
  };
}
