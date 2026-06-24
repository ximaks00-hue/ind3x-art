import type { RenderableModel } from "../ipc/types";

/** Deep-clone a renderable for comparator snapshots. */
export function cloneRenderable(model: RenderableModel): RenderableModel {
  return structuredClone(model);
}
