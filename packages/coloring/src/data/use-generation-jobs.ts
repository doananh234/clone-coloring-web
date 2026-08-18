"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpGet, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import { type GenerationJob, isActiveGenerationJob } from "./generation-jobs";

/**
 * Global feed of background generation jobs for the header queue drawer.
 * Polls faster while anything is active, slow when idle. When a job flips to a
 * terminal state we invalidate that book's query so a freshly generated cover
 * shows up without a manual refresh.
 */
export function useGenerationJobs(limit = 30) {
  const qc = useQueryClient();
  const seenTerminal = useRef<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["coloring", "generation-jobs"],
    queryFn: () => httpGet<{ jobs: GenerationJob[] }>(`${COLORING_API_BASE}/generation-jobs?limit=${limit}`),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      // Fast cadence only while something is actually running; idle drops to 30s
      // so the header drawer doesn't refetch the full job list every 20s forever.
      return jobs.some(isActiveGenerationJob) ? 4000 : 30000;
    },
    refetchOnWindowFocus: true,
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
