import { useEffect } from "react";

import { ipc } from "../ipc/client";
import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";

export function useAppBootstrap() {
  const theme = useSettingsStore((s) => s.theme);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const appInfo = useProjectStore((s) => s.appInfo);
  const ipcHealthy = useProjectStore((s) => s.ipcHealthy);
  const setAppInfo = useProjectStore((s) => s.setAppInfo);
  const setIpcHealthy = useProjectStore((s) => s.setIpcHealthy);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
    document.documentElement.style.fontSize = `${uiScale * 100}%`;
  }, [uiScale]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [info, pong] = await Promise.all([ipc.getAppInfo(), ipc.ping()]);
        if (cancelled) return;
        setAppInfo(info);
        setIpcHealthy(pong === "pong");
      } catch {
        if (!cancelled) setIpcHealthy(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setAppInfo, setIpcHealthy]);

  return { appInfo, ipcHealthy };
}
