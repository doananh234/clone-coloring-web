/**
 * Sequential batch runner for per-page regen. Runs `regenOne` for each index in
 * order (never in parallel), skips a page that throws and continues with the
 * rest, and reports progress after each page. Returns the ok/err index split so
 * the caller can summarize and keep failed pages highlighted for a retry.
 *
 * Pure (no React / no network) so it can be unit-tested in isolation; the
 * batch-select screen injects `regenOne` (a single reproduce+apply call).
 */
export async function runBatchRegen(
  indices: number[],
  regenOne: (index: number) => Promise<void>,
  onProgress: (done: number, index: number, ok: boolean) => void,
): Promise<{ ok: number[]; err: number[] }> {
  const ok: number[] = [];
  const err: number[] = [];
  let done = 0;
  for (const index of indices) {
    let succeeded = true;
    try {
      await regenOne(index);
      ok.push(index);
    } catch {
      succeeded = false;
      err.push(index);
    }
    done += 1;
    onProgress(done, index, succeeded);
  }
  return { ok, err };
}
