import { ipc } from "../../ipc/client";
import type {
  CatalogFacets,
  CatalogFilter,
  CatalogPage,
  PageReq,
  ProjectHandle,
  RenderableModel,
  VariantKey,
} from "../../ipc/types";

export async function queryCatalog(
  handle: ProjectHandle,
  filter: CatalogFilter,
  page: PageReq,
): Promise<CatalogPage> {
  return ipc.queryCatalog(handle, filter, page);
}

export async function getCatalogEntry(handle: ProjectHandle, entryId: string) {
  return ipc.getCatalogEntry(handle, entryId);
}

export async function getCatalogFacets(handle: ProjectHandle): Promise<CatalogFacets> {
  return ipc.getCatalogFacets(handle);
}

export async function resolveCatalogEntry(
  handle: ProjectHandle,
  entryId: string,
  context: "icon" | "studio" | "placed" = "icon",
  variantKey?: string | null,
): Promise<RenderableModel> {
  return ipc.resolveCatalogEntry(handle, entryId, context, variantKey ?? null);
}

export async function rebuildProjectCatalog(
  handle: ProjectHandle,
  language: string,
): Promise<void> {
  await ipc.rebuildProjectCatalog(handle, language);
}

export async function listVariants(
  handle: ProjectHandle,
  assetPath: string,
): Promise<VariantKey[]> {
  return ipc.listVariants(handle, assetPath);
}

export async function getCatalogIconCache(
  handle: ProjectHandle,
  iconKey: string,
): Promise<string | null> {
  return ipc.getCatalogIconCache(handle, iconKey);
}

export async function setCatalogIconCache(
  handle: ProjectHandle,
  iconKey: string,
  pngBase64: string,
): Promise<void> {
  await ipc.setCatalogIconCache(handle, iconKey, pngBase64);
}

export async function invalidateCatalogIconsForTextures(
  handle: ProjectHandle,
  texturePaths: string[],
): Promise<string[]> {
  return ipc.invalidateCatalogIconsForTextures(handle, texturePaths);
}
