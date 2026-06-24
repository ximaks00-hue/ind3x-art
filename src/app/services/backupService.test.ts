import { describe, expect, it } from "vitest";

import { backupIdFromPath } from "./backupService";

describe("backupService", () => {
  it("derives stable backup ids from paths", async () => {
    const id = await backupIdFromPath("C:/mods/pack.jar.bak");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(await backupIdFromPath("C:/mods/pack.jar.bak")).toBe(id);
  });
});
