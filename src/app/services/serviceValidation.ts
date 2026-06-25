import type { PageReq, ProjectHandle } from "../../ipc/types";

const MAX_PAGE_LIMIT = 500;
const MAX_ICON_BASE64_CHARS = 512 * 1024;

export function requireProjectHandle(
  handle: ProjectHandle | null | undefined,
): ProjectHandle {
  if (!handle || typeof handle.id !== "number" || handle.id <= 0) {
    throw new Error("No open project");
  }
  return handle;
}

export function clampPageReq(page: PageReq): PageReq {
  return {
    offset: Math.max(0, Math.floor(page.offset)),
    limit: Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(page.limit))),
  };
}

export function requireNonEmptyId(id: string, label = "id"): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`Missing ${label}`);
  return trimmed;
}

export function validateCatalogIconBase64(pngBase64: string): string {
  const trimmed = pngBase64.trim();
  if (!trimmed) throw new Error("Icon payload is empty");
  if (trimmed.length > MAX_ICON_BASE64_CHARS) {
    throw new Error("Icon payload exceeds size limit");
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    throw new Error("Icon payload is not valid base64");
  }
  return trimmed;
}
