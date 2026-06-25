/** Fire-and-forget with a logged rejection handler (avoids unhandled promise rejections). */
export function safeVoid(promise: Promise<unknown>, context: string): void {
  void promise.catch((error) => {
    console.warn(`[${context}]`, error);
  });
}
