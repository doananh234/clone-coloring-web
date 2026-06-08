/**
 * Next.js instrumentation — runs once at server startup.
 * Polyfills Promise.try for pdfjs-dist v5 compatibility.
 */
export async function register() {
  if (typeof Promise.try !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Promise as any).try = function <T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
      return new Promise<T>((resolve) => resolve(fn(...args)));
    };
  }
}
