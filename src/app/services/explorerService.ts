import { ipc } from "../../ipc/client";
import type {
  AssetDetails,
  AssetEntry,
  AssetFacets,
  ProjectHandle,
} from "../../ipc/types";
import { requireNonEmptyId, requireProjectHandle } from "./serviceValidation";

export async function getAssetFacets(handle: ProjectHandle): Promise<AssetFacets> {
  return ipc.getAssetFacets(requireProjectHandle(handle));
}

export async function getAssetDetails(
  handle: ProjectHandle,
  assetId: string,
): Promise<AssetDetails> {
  return ipc.getAssetDetails(
    requireProjectHandle(handle),
    requireNonEmptyId(assetId, "asset id"),
  );
}

export async function getAssetEntry(
  handle: ProjectHandle,
  assetId: string,
): Promise<AssetEntry> {
  return ipc.getAssetEntry(
    requireProjectHandle(handle),
    requireNonEmptyId(assetId, "asset id"),
  );
}

export async function revealAssetInFolder(
  handle: ProjectHandle,
  assetPath: string,
): Promise<void> {
  return ipc.revealAssetInFolder(
    requireProjectHandle(handle),
    requireNonEmptyId(assetPath, "asset path"),
  );
}
