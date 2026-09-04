// apps/admin/src/lib/poll-generation-job.ts
// Client-side poller for background GenerationJobs. The interactive cover-gen
// flows (compose-cover, ai-cover) now enqueue a job and poll its status here
// instead of blocking on a 100–300s request that Cloudflare kills at ~100s (524).

export type GenerationJobStatus = "pending" | "running" | "done" | "error";

export interface GenerationJob {
  id: string;
  type: string;
  status: GenerationJobStatus;
  resultUrl: string | null;
  resultId: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
// Cover gen can take a few minutes (KingCong ~150s/call, 2-phase compose can be
// two of them). Cap the poll so a wedged worker doesn't spin forever.
const MAX_POLL_MS = 8 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll GET /api/generation-jobs/{jobId} every ~3s until the job is done or error.
 * Resolves with the terminal job (caller reads resultUrl) or throws on "error"
 * (message = job.error) / timeout.
 */
export async function pollGenerationJob(
  jobId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GenerationJob> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_MS) {
    if (opts.signal?.aborted) throw new Error("aborted");

    const res = await fetch(`/api/generation-jobs/${jobId}`, {
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { job?: GenerationJob };
      const job = data.job;
      if (job) {
        if (job.status === "done") return job;
        if (job.status === "error") {
          throw new Error(job.error || "Tạo bìa thất bại");
        }
      }
    }
    // 404 (row not yet visible) / transient errors: keep polling.

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Hết thời gian chờ tạo bìa — thử lại sau ít phút.");
}
