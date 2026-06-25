import type { ProjectHandle } from "../../ipc/types";
import { commitChanges, type PixelChange } from "./documentStore";
import {
  appendBrushStrokeChanges,
  beginBrushStroke,
  cancelBrushStroke,
  isBrushStrokeActive,
  takeBrushStrokeChanges,
} from "./paintStrokeBuffer";
export { beginBrushStroke, cancelBrushStroke };

export function endBrushStroke(
  handle: ProjectHandle,
  texturePath: string,
  label: string,
  flushIcons = false,
): void {
  const changes = takeBrushStrokeChanges(texturePath);
  if (changes.length === 0) return;
  commitChanges(handle, texturePath, changes, true, label, flushIcons);
}

export function applyBrushChanges(
  handle: ProjectHandle,
  texturePath: string,
  changes: PixelChange[],
  label: string,
): void {
  if (changes.length === 0) return;
  if (isBrushStrokeActive(texturePath)) {
    commitChanges(handle, texturePath, changes, false, label, false, true);
    appendBrushStrokeChanges(texturePath, changes);
    return;
  }
  commitChanges(handle, texturePath, changes, true, label);
}
