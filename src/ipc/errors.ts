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

export function formatIpcError(error: unknown): string {
  if (error instanceof IpcError) return error.message;
  if (isCoreError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
