import { listen } from "@tauri-apps/api/event";

import { createE2eMockIpc } from "./e2eMock";
import { spectaCommands } from "./spectaClient";

export { IpcError, isCoreError } from "./errors";

export const ipc =
  import.meta.env.VITE_E2E_MOCK === "true" && !import.meta.env.PROD
    ? createE2eMockIpc()
    : {
        ...spectaCommands,
        onSourceChanged: (cb: (payload: { path: string; kind: string }) => void) =>
          listen<{ path: string; kind: string }>("source-changed", (e) => cb(e.payload)),
        onCacheInvalidated: (cb: () => void) => listen("cache-invalidated", () => cb()),
      };
