import { ipc } from "../../ipc/client";
import type {
  AssetDetails,
  AssetEntry,
  AssetFacets,
  ProjectHandle,
} from "../../ipc/types";

export async function getAssetFacets(handle: ProjectHandle): Promise<AssetFacets> {
  return ipc.getAssetFacets(handle);
}

export async function getAssetDetails(
  handle: ProjectHandle,
  assetId: string,
): Promise<AssetDetails> {
  return ipc.getAssetDetails(handle, assetId);
}

export async function getAssetEntry(
  handle: ProjectHandle,
  assetId: string,
): Promise<AssetEntry> {
  return ipc.getAssetEntry(handle, assetId);
}

export async function revealAssetInFolder(
  handle: ProjectHandle,
  assetPath: string,
): Promise<void> {
  return ipc.revealAssetInFolder(handle, assetPath);
}
