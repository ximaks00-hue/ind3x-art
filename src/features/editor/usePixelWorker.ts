/**
 * Hook that shares a singleton pixel worker across editor surfaces.
 */
import type { Remote } from "comlink";
import { useEffect, useRef } from "react";

import { acquirePixelWorker, releasePixelWorker } from "./pixelWorkerClient";
import type { PixelWorkerApi } from "./pixelWorker";

export function usePixelWorker(): React.MutableRefObject<Remote<PixelWorkerApi> | null> {
  const proxyRef = useRef<Remote<PixelWorkerApi> | null>(null);

  useEffect(() => {
    proxyRef.current = acquirePixelWorker();
    return () => {
      proxyRef.current = null;
      releasePixelWorker();
    };
  }, []);

  return proxyRef;
}
