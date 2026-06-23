import type { ProjectHandle } from "../../ipc/types";
import type { EditorTool } from "../../state/editorStore";
import { useEditorStore } from "../../state/editorStore";
import {
  collectStrokeChanges,
  floodFillChanges,
  linePixels,
  lineToolChanges,
  pickColor,
} from "./tools";
import { commitChanges, ensureTextureDocument } from "./textureDocument";

export async function paintAtPixel(
  handle: ProjectHandle,
  texturePath: string,
  x: number,
  y: number,
  tool: EditorTool,
  color: string,
  isStroke: boolean,
  lastPixel: [number, number] | null,
): Promise<[number, number] | null> {
  await ensureTextureDocument(handle, texturePath);
  const { symmetryX } = useEditorStore.getState();

  if (tool === "picker") {
    const picked = pickColor(texturePath, x, y);
    if (picked) useEditorStore.getState().setColor(picked);
    return [x, y];
  }

  if (tool === "fill") {
    const changes = floodFillChanges(texturePath, x, y, color);
    commitChanges(handle, texturePath, changes);
    return [x, y];
  }

  if (tool === "line" || tool === "rect") {
    return [x, y];
  }

  const points: [number, number][] =
    isStroke && lastPixel ? linePixels(lastPixel[0], lastPixel[1], x, y) : [[x, y]];

  const changes = collectStrokeChanges(texturePath, points, tool, color, symmetryX);
  commitChanges(handle, texturePath, changes);
  return [x, y];
}

export async function paintLineOnTexture(
  handle: ProjectHandle,
  texturePath: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): Promise<void> {
  await ensureTextureDocument(handle, texturePath);
  const { symmetryX } = useEditorStore.getState();
  const changes = lineToolChanges(
    texturePath,
    x0,
    y0,
    x1,
    y1,
    "pencil",
    color,
    symmetryX,
  );
  commitChanges(handle, texturePath, changes);
}

export function pickAtPixel(texturePath: string, x: number, y: number): string | null {
  return pickColor(texturePath, x, y);
}
