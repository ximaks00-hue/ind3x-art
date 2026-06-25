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
import {
  clampPageReq,
  requireNonEmptyId,
  requireProjectHandle,
  validateCatalogIconBase64,
} from "./serviceValidation";

export async function queryCatalog(
  handle: ProjectHandle,
  filter: CatalogFilter,
  page: PageReq,
): Promise<CatalogPage> {
  return ipc.queryCatalog(requireProjectHandle(handle), filter, clampPageReq(page));
}

export async function getCatalogEntry(handle: ProjectHandle, entryId: string) {
  return ipc.getCatalogEntry(requireProjectHandle(handle), requireNonEmptyId(entryId, "entry id"));
}

export async function getCatalogFacets(handle: ProjectHandle): Promise<CatalogFacets> {
  return ipc.getCatalogFacets(requireProjectHandle(handle));
}

export async function resolveCatalogEntry(
  handle: ProjectHandle,
  entryId: string,
  context: "icon" | "studio" | "placed" = "icon",
  variantKey?: string | null,
): Promise<RenderableModel> {
  return ipc.resolveCatalogEntry(
    requireProjectHandle(handle),
    requireNonEmptyId(entryId, "entry id"),
    context,
    variantKey ?? null,
  );
}

export async function rebuildProjectCatalog(
  handle: ProjectHandle,
  language: string,
): Promise<void> {
  await ipc.rebuildProjectCatalog(requireProjectHandle(handle), language.trim() || "en_us");
}

export async function listVariants(
  handle: ProjectHandle,
  assetPath: string,
): Promise<VariantKey[]> {
  return ipc.listVariants(requireProjectHandle(handle), requireNonEmptyId(assetPath, "asset path"));
}

export async function getCatalogIconCache(
  handle: ProjectHandle,
  iconKey: string,
): Promise<string | null> {
  return ipc.getCatalogIconCache(
    requireProjectHandle(handle),
    requireNonEmptyId(iconKey, "icon key"),
  );
}

export async function setCatalogIconCache(
  handle: ProjectHandle,
  iconKey: string,
  pngBase64: string,
): Promise<void> {
  await ipc.setCatalogIconCache(
    requireProjectHandle(handle),
    requireNonEmptyId(iconKey, "icon key"),
    validateCatalogIconBase64(pngBase64),
  );
}

export async function invalidateCatalogIconsForTextures(
  handle: ProjectHandle,
  texturePaths: string[],
): Promise<string[]> {
  return ipc.invalidateCatalogIconsForTextures(
    requireProjectHandle(handle),
    texturePaths.map((path) => requireNonEmptyId(path, "texture path")),
  );
}
