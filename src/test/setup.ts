import { createCanvas, Image as CanvasImage } from "canvas";

globalThis.Image = CanvasImage as unknown as typeof Image;

const originalCreateElement = document.createElement.bind(document);

document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
  if (tagName.toLowerCase() === "canvas") {
    return createCanvas(1, 1) as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tagName, options);
}) as typeof document.createElement;
