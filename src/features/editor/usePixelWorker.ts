/**
 * Hook that initialises the pixel worker once and returns a ref to its proxy.
 * Uses Comlink for typed communication.
 */
import * as Comlink from "comlink";
import { useEffect, useRef } from "react";

import type { PixelWorkerApi } from "./pixelWorker";

export function usePixelWorker(): React.MutableRefObject<Comlink.Remote<PixelWorkerApi> | null> {
  const proxyRef = useRef<Comlink.Remote<PixelWorkerApi> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./pixelWorker.ts", import.meta.url), {
      type: "module",
    });
    proxyRef.current = Comlink.wrap<PixelWorkerApi>(worker);

    return () => {
      proxyRef.current = null;
      worker.terminate();
    };
  }, []);

  return proxyRef;
}
