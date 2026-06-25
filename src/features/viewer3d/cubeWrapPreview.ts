import type { RenderableModel, RenderFace, TextureMetaInfo } from "../../ipc/types";

const CUBE_DIRECTIONS = ["down", "up", "north", "south", "west", "east"] as const;

function cubeFace(direction: string, texturePath: string, uv: [number, number, number, number]): RenderFace {
  return {
    direction,
    uv,
    texture: texturePath,
    rotation: 0,
    tintindex: -1,
    cullface: null,
  };
}

/** Synthetic block model with the same texture on all six faces (cube_all) for Classic face painting. */
export function buildCubeAllPreviewModel(
  texturePath: string,
  meta?: TextureMetaInfo | null,
): RenderableModel {
  const w = meta?.width && meta.width > 0 ? meta.width : 16;
  const h = meta?.height && meta.height > 0 ? meta.height : 16;
  const uv: [number, number, number, number] = [0, 0, 16, 16];
  const textureMeta: TextureMetaInfo = {
    width: w,
    height: h,
    animation: meta?.animation ?? null,
  };

  return {
    kind: "block",
    modelId: `cube_wrap:${texturePath}`,
    cuboids: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        rotation: null,
        shade: true,
        faces: CUBE_DIRECTIONS.map((direction) => cubeFace(direction, texturePath, uv)),
      },
    ],
    textureRefs: { all: texturePath },
    textureMeta: { [texturePath]: textureMeta },
    modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
    display: {},
    ambientOcclusion: true,
  };
}
