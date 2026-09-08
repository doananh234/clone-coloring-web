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

  // Node runtime only (skip edge). Feed the DB-backed image provider order into
  // server-core's chain so admin image routes honor UI-changed primary/fallback
  // priority at runtime without a redeploy (env remains the default).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setImageProviderConfigResolver } = await import("@vx/server-core/ai");
    const { loadImageProviderConfig } = await import("@vx/db");
    setImageProviderConfigResolver(loadImageProviderConfig);
  }
}
