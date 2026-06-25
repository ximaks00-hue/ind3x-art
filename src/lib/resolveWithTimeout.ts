/** Race a promise against an abort signal and a wall-clock timeout. */
export function resolveWithTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
  timeoutMessage = "Request timed out",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
