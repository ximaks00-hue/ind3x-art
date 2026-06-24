import { createCanvas, Image as CanvasImage } from "canvas";

globalThis.Image = CanvasImage as unknown as typeof Image;

const localStorageBacking = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => localStorageBacking.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageBacking.set(key, value);
    },
    removeItem: (key: string) => {
      localStorageBacking.delete(key);
    },
    clear: () => {
      localStorageBacking.clear();
    },
  },
  writable: true,
});

const originalCreateElement = document.createElement.bind(document);

document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
  if (tagName.toLowerCase() === "canvas") {
    return createCanvas(1, 1) as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tagName, options);
}) as typeof document.createElement;
