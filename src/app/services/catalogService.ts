import { ipc } from "../../ipc/client";
import { withAbortableIpc } from "../../ipc/abortable";
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

export type CatalogServiceOptions = {
  signal?: AbortSignal;
};

export async function queryCatalog(
  handle: ProjectHandle,
  filter: CatalogFilter,
  page: PageReq,
  options?: CatalogServiceOptions,
): Promise<CatalogPage> {
  return withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.queryCatalog(requireProjectHandle(handle), filter, clampPageReq(page), ipcRequestId),
  );
}

export async function getCatalogEntry(
  handle: ProjectHandle,
  entryId: string,
  options?: CatalogServiceOptions,
) {
  return withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.getCatalogEntry(
      requireProjectHandle(handle),
      requireNonEmptyId(entryId, "entry id"),
      ipcRequestId,
    ),
  );
}

export async function getCatalogFacets(handle: ProjectHandle): Promise<CatalogFacets> {
  return ipc.getCatalogFacets(requireProjectHandle(handle));
}

export async function resolveCatalogEntry(
  handle: ProjectHandle,
  entryId: string,
  context: "icon" | "studio" | "placed" = "icon",
  variantKey?: string | null,
  options?: CatalogServiceOptions,
): Promise<RenderableModel> {
  return withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.resolveCatalogEntry(
      requireProjectHandle(handle),
      requireNonEmptyId(entryId, "entry id"),
      context,
      variantKey ?? null,
      ipcRequestId,
    ),
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
  options?: CatalogServiceOptions,
): Promise<VariantKey[]> {
  return withAbortableIpc(options?.signal, (ipcRequestId) =>
    ipc.listVariants(
      requireProjectHandle(handle),
      requireNonEmptyId(assetPath, "asset path"),
      ipcRequestId,
    ),
  );
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
