import { useUiStore } from "../state/uiStore";

const PROGRESS_TOAST_MS = 200;

/** Run async work; show info toast if it exceeds 200ms. */
export async function withProgressToast<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  let toastShown = false;
  let failed = false;
  const timer = window.setTimeout(() => {
    toastShown = true;
    useUiStore.getState().pushToast(`${label}…`, "info");
  }, PROGRESS_TOAST_MS);

  try {
    return await work();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    window.clearTimeout(timer);
    if (toastShown && !failed) {
      const ms = Math.round(performance.now() - started);
      useUiStore.getState().pushToast(`${label} done (${ms}ms)`, "success");
    }
  }
}
