/** Client-side guards for save dialog paths — mirrors Rust `validate_relative_asset_path`. */

export function normalizeRelativeAssetPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) return null;
  if (normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes(":")) return null;

  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

export function validateSaveNamespace(namespace: string): string | null {
  const trimmed = namespace.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "Namespace cannot be empty";
  if (!/^[a-z0-9_.-]+$/i.test(trimmed)) {
    return "Namespace may only contain letters, numbers, _, -, and .";
  }
  return null;
}

const TEXTURE_RENAME_PATH_RE =
  /^assets\/[a-z0-9_.-]+\/textures\/[a-z0-9_./-]+\.png$/i;

export function validateRenameTargetPath(path: string): string | null {
  const normalized = normalizeRelativeAssetPath(path);
  if (!normalized) {
    return "Path must be relative (no .., absolute paths, or drive letters)";
  }
  if (!TEXTURE_RENAME_PATH_RE.test(normalized)) {
    return "Path must look like assets/<namespace>/textures/.../*.png";
  }
  return null;
}
