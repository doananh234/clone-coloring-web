"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpGet, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import { type GenerationJob, isActiveGenerationJob } from "./generation-jobs";

/**
 * Poll cadence for the always-mounted queue feed. The drawer lives in the header
 * on EVERY screen, so an unconditional interval means the whole app refetches the
 * full job list forever. Instead:
 *   - idle (nothing active) → don't poll at all. A new job is surfaced by the
 *     enqueue sites invalidating ["coloring","generation-jobs"] (see
 *     use-source-covers) / an explicit refetch (see export-link-button).
 *   - active but drawer closed → gentle 20s so the header badge stays roughly live.
 *   - active AND drawer open → fast 4s, since the user is watching progress.
 */
export function generationPollInterval(opts: { open: boolean; hasActive: boolean }): number | false {
  if (!opts.hasActive) return false;
  return opts.open ? 4000 : 20000;
}

/**
 * Global feed of background generation jobs for the header queue drawer.
 * Polls faster while anything is active, slow when idle. When a job flips to a
 * terminal state we invalidate that book's query so a freshly generated cover
 * shows up without a manual refresh.
 *
 * Pass `open` from the drawer so the fast cadence only runs while it's visible.
 */
export function useGenerationJobs(opts: { open?: boolean; limit?: number } = {}) {
  const { open = false, limit = 30 } = opts;
  const qc = useQueryClient();
  const seenTerminal = useRef<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["coloring", "generation-jobs"],
    queryFn: () => httpGet<{ jobs: GenerationJob[] }>(`${COLORING_API_BASE}/generation-jobs?limit=${limit}`),
    refetchInterval: (query) =>
      generationPollInterval({
        open,
        hasActive: (query.state.data?.jobs ?? []).some(isActiveGenerationJob),
      }),
    // Inherits the global refetchOnWindowFocus: false — no per-focus refetch churn.
  });

  const jobs = q.data?.jobs ?? [];

  // Detect fresh done/error transitions → refresh affected book(s) once.
  // Runs in an effect (not the render body) so query invalidation is a proper
  // side effect rather than firing mid-render.
  useEffect(() => {
    for (const j of jobs) {
      if ((j.status === "done" || j.status === "error") && !seenTerminal.current.has(j.id)) {
        seenTerminal.current.add(j.id);
        if (j.status === "done") qc.invalidateQueries({ queryKey: ["coloring", "book", j.bookId] });
      }
    }
  }, [jobs, qc]);

  const activeCount = jobs.filter(isActiveGenerationJob).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["coloring", "generation-jobs"] });

  /** Delete one finished job (server rejects pending/running). */
  const remove = async (id: string) => {
    await httpDel(`${COLORING_API_BASE}/generation-jobs?id=${encodeURIComponent(id)}`);
    await invalidate();
  };

  /** Bulk-clear all finished (done/error) jobs. */
  const clearCompleted = async () => {
    await httpDel(`${COLORING_API_BASE}/generation-jobs`);
    await invalidate();
  };

  return { jobs, activeCount, isLoading: q.isLoading, refetch: q.refetch, remove, clearCompleted };
}
