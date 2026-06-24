import { ipc } from "../../ipc/client";
import type {
  CatalogFacets,
  CatalogFilter,
  CatalogPage,
  PageReq,
  ProjectHandle,
  RenderableModel,
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
): Promise<RenderableModel> {
  return ipc.resolveCatalogEntry(handle, entryId);
}
