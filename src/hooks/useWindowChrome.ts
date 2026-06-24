import { useEffect } from "react";

export function useWindowChrome() {
  useEffect(() => {
    let cancelled = false;

    async function applyEffects() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { Effect, EffectState } = await import("@tauri-apps/api/window");
        if (cancelled) return;
        const win = getCurrentWindow();
        await win.setEffects({
          effects: [Effect.Mica],
          state: EffectState.FollowsWindowActiveState,
        });
      } catch {
        // Mica unavailable outside Windows 11 / Tauri host
      }
    }

    void applyEffects();
    return () => {
      cancelled = true;
    };
  }, []);
}
