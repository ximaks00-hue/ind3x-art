import type { CoreErrorPayload } from "./types";

export class IpcError extends Error {
  readonly code: string;

  constructor(payload: CoreErrorPayload) {
    super(payload.message);
    this.name = "IpcError";
    this.code = payload.code;
  }
}

export function isCoreError(value: unknown): value is CoreErrorPayload {
  return (
    typeof value === "object" && value !== null && "code" in value && "message" in value
  );
}
