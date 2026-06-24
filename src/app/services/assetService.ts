import { ipc } from "../../ipc/client";
import type {
  AssetFilter,
  AssetPage,
  PageReq,
  ProjectHandle,
} from "../../ipc/types";

export async function queryAssets(
  handle: ProjectHandle,
  filter: AssetFilter,
  page: PageReq,
): Promise<AssetPage> {
  return ipc.queryAssets(handle, filter, page);
}
