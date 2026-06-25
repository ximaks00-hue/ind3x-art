import type { TextureMetaInfo } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";

const DEFAULT_TEXTURE_SIZE = 16;

export function textureSpriteDimensions(
  meta?: Pick<TextureMetaInfo, "width" | "height"> | null,
): { width: number; height: number } {
  const width = meta?.width && meta.width > 0 ? meta.width : DEFAULT_TEXTURE_SIZE;
  const height = meta?.height && meta.height > 0 ? meta.height : DEFAULT_TEXTURE_SIZE;
  return { width, height };
}

/** Full-texture sprite face for flat / item-generated textures (not a 16×16 cube atlas cell). */
export function buildFullTextureSpriteFace(
  texturePath: string,
  direction: string,
  meta?: Pick<TextureMetaInfo, "width" | "height"> | null,
): Omit<SelectedFace, "cuboidIndex" | "faceIndex"> & {
  cuboidIndex: number;
  faceIndex: number;
} {
  const { width, height } = textureSpriteDimensions(meta);
  return {
    cuboidIndex: 0,
    faceIndex: 0,
    direction,
    texturePath,
    uv: [0, 0, width, height],
    rotation: 0,
    tintindex: -1,
    hitUv: [0.5, 0.5],
    pixel: [Math.floor(width / 2), Math.floor(height / 2)],
  };
}
