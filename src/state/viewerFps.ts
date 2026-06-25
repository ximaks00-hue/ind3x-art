type Listener = () => void;

let fps = 0;
const listeners = new Set<Listener>();

export function getViewerFps(): number {
  return fps;
}

export function setViewerFps(value: number): void {
  if (value === fps) return;
  fps = value;
  for (const listener of listeners) listener();
}

export function subscribeViewerFps(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
