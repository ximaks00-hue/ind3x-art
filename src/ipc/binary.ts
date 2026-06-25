/** Decode base64 texture payloads without materializing a JSON number[]. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  const fromBase64 = (
    Uint8Array as typeof Uint8Array & { fromBase64?: (input: string) => Uint8Array }
  ).fromBase64;
  if (typeof fromBase64 === "function") {
    return fromBase64(normalized);
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
