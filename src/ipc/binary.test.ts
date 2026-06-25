import { describe, expect, it } from "vitest";

import { base64ToUint8Array, base64ToUint8ArrayAsync } from "./binary";

describe("base64ToUint8Array", () => {
  it("decodes standard base64", () => {
    expect([...base64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
  });
});

describe("base64ToUint8ArrayAsync", () => {
  it("decodes async same as sync for small payloads", async () => {
    const sync = base64ToUint8Array("AQID");
    const asyncDecoded = await base64ToUint8ArrayAsync("AQID");
    expect([...asyncDecoded]).toEqual([...sync]);
  });
});
