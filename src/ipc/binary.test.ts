import { describe, expect, it } from "vitest";

import { base64ToUint8Array } from "./binary";

describe("base64ToUint8Array", () => {
  it("decodes standard base64", () => {
    expect([...base64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
  });
});
