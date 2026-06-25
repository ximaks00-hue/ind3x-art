import { ipc } from "../../ipc/client";
import type { AssetFilter, AssetPage, PageReq, ProjectHandle } from "../../ipc/types";
import { clampPageReq, requireProjectHandle } from "./serviceValidation";

export async function queryAssets(
  handle: ProjectHandle,
  filter: AssetFilter,
  page: PageReq,
): Promise<AssetPage> {
  return ipc.queryAssets(requireProjectHandle(handle), filter, clampPageReq(page));
}
