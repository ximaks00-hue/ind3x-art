/**
 * Hook that shares a singleton pixel worker across editor surfaces.
 */
import type { Remote } from "comlink";
import { useEffect, useRef } from "react";

import { acquirePixelWorker, getPixelWorkerProxy, releasePixelWorker } from "./pixelWorkerClient";
import type { PixelWorkerApi } from "./pixelWorker";

function createLiveWorkerRef(): React.MutableRefObject<Remote<PixelWorkerApi> | null> {
  const box = { current: null as Remote<PixelWorkerApi> | null };
  Object.defineProperty(box, "current", {
    enumerable: true,
    configurable: true,
    get(): Remote<PixelWorkerApi> | null {
      try {
        return getPixelWorkerProxy();
      } catch {
        return null;
      }
    },
    set() {
      // Ignore external assignment — proxy is resolved lazily.
    },
  });
  return box as React.MutableRefObject<Remote<PixelWorkerApi> | null>;
}

export function usePixelWorker(): React.MutableRefObject<Remote<PixelWorkerApi> | null> {
  const proxyRef = useRef<React.MutableRefObject<Remote<PixelWorkerApi> | null> | null>(null);
  if (!proxyRef.current) {
    proxyRef.current = createLiveWorkerRef();
  }

  useEffect(() => {
    acquirePixelWorker();
    return () => {
      releasePixelWorker();
    };
  }, []);

  return proxyRef.current;
}
