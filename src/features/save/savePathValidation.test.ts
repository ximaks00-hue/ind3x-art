import { describe, expect, it } from "vitest";

import {
  normalizeRelativeAssetPath,
  validateRenameTargetPath,
  validateSaveNamespace,
} from "./savePathValidation";

describe("savePathValidation", () => {
  it("rejects traversal and absolute paths", () => {
    expect(normalizeRelativeAssetPath("../secret.png")).toBeNull();
    expect(normalizeRelativeAssetPath("/etc/passwd")).toBeNull();
    expect(normalizeRelativeAssetPath("C:/windows/foo.png")).toBeNull();
  });

  it("normalizes supported relative paths", () => {
    expect(normalizeRelativeAssetPath("assets\\minecraft//textures/stone.png")).toBe(
      "assets/minecraft/textures/stone.png",
    );
  });

  it("validates namespace characters", () => {
    expect(validateSaveNamespace("create")).toBeNull();
    expect(validateSaveNamespace("my_mod")).toBeNull();
    expect(validateSaveNamespace("../evil")).not.toBeNull();
    expect(validateSaveNamespace("")).not.toBeNull();
  });

  it("validates rename texture paths", () => {
    expect(
      validateRenameTargetPath("assets/minecraft/textures/block/stone_v2.png"),
    ).toBeNull();
    expect(validateRenameTargetPath("assets/../textures/block/a.png")).not.toBeNull();
    expect(validateRenameTargetPath("textures/block/a.png")).not.toBeNull();
  });
});
