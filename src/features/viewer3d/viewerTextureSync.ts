import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import {
  getDirtyTexturePaths,
  getTextureCanvas,
  isTextureDirty,
} from "../editor/documentStore";
import { useViewerStore } from "../../state/viewerStore";
import { refreshTextureFromCanvas, setActiveBiome } from "./textureLoader";

export function modelTexturePaths(model: RenderableModel): string[] {
  const paths = new Set<string>();
  for (const cuboid of model.cuboids) {
    for (const face of cuboid.faces) paths.add(face.texture);
  }
  if (model.kind === "itemGenerated") {
    for (const path of Object.values(model.textureRefs)) {
      if (path) paths.add(path);
    }
  }
  return [...paths];
}

/** Push unsaved canvas pixels into the Three.js texture cache (before mesh build or cache hits). */
export function refreshDirtyTexturesForViewer(
  handle: ProjectHandle,
  texturePaths?: Iterable<string>,
): void {
  const paths =
    texturePaths === undefined
      ? getDirtyTexturePaths()
      : [...texturePaths].filter((path) => isTextureDirty(path));
  for (const path of paths) {
    const canvas = getTextureCanvas(path);
    if (canvas) refreshTextureFromCanvas(handle, path, canvas);
  }
}

/** Switch biome tint without discarding unsaved paint on the 3D preview. */
export function applyBiomeChange(handle: ProjectHandle, biome: string): void {
  setActiveBiome(biome);
  refreshDirtyTexturesForViewer(handle);
  useViewerStore.getState().bumpTextureReloadTick();
}
