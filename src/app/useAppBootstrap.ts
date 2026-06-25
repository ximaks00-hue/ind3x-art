import { useEffect } from "react";

import { ipc } from "../ipc/client";
import { useProjectStore } from "../state/projectStore";
import { syncTextureCacheLimitsFromSettings, subscribeTextureCacheLimitSync } from "../state/textureCacheSync";
import { syncViewerPreferencesFromSettings } from "../state/viewerPreferencesSync";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore } from "../state/uiStore";

export function useAppBootstrap() {
  const theme = useSettingsStore((s) => s.theme);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const appInfo = useProjectStore((s) => s.appInfo);
  const ipcHealthy = useProjectStore((s) => s.ipcHealthy);
  const setAppInfo = useProjectStore((s) => s.setAppInfo);
  const setIpcHealthy = useProjectStore((s) => s.setIpcHealthy);
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
    document.documentElement.style.fontSize = `${uiScale * 100}%`;
  }, [uiScale]);

  useEffect(() => {
    let cancelled = false;

    const runPostHydrationSync = () => {
      syncViewerPreferencesFromSettings();
      syncTextureCacheLimitsFromSettings();
    };

    if (useSettingsStore.persist.hasHydrated()) {
      runPostHydrationSync();
    } else {
      useSettingsStore.persist.onFinishHydration(runPostHydrationSync);
    }

    const unsubCache = subscribeTextureCacheLimitSync();

    async function bootstrap(attempt = 0): Promise<void> {
      const maxAttempts = 4;
      try {
        const [info, pong] = await Promise.all([ipc.getAppInfo(), ipc.ping()]);
        if (cancelled) return;
        setAppInfo(info);
        setIpcHealthy(pong === "pong");
      } catch (error) {
        if (attempt + 1 < maxAttempts && !cancelled) {
          await new Promise<void>((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          return bootstrap(attempt + 1);
        }
        console.error("[useAppBootstrap] IPC bootstrap failed", error);
        if (!cancelled) {
          setIpcHealthy(false);
          pushToast("Backend unreachable — restart the app", "error");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      unsubCache();
    };
  }, [setAppInfo, setIpcHealthy, pushToast]);

  return { appInfo, ipcHealthy };
}
