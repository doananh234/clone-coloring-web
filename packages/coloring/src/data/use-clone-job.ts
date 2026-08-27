"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import type { CloneJobResponse, CloneJobDetail } from "./types";
import { COLORING_API_BASE } from "./config";

export interface UseCloneJobResult {
  job: CloneJobDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface UseCloneJobOptions {
  /**
   * Skip the heavy per-page `rawData` (scene/characters/prompts) + bookData/entityMap.
   * For consumers that only render page thumbnails (e.g. book-detail "Sách gốc").
   */
  lite?: boolean;
}

const isActive = (status: string) => status === "queued" || status.endsWith("ing");

/** Fetch a single clone job (GET /api/clone/[jobId]). */
export function useCloneJob(jobId: string, opts: UseCloneJobOptions = {}): UseCloneJobResult {
  const lite = opts.lite ?? false;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["coloring", "clone-job", jobId, lite ? "lite" : "full"],
    queryFn: () =>
      httpGet<CloneJobResponse>(
        `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}${lite ? "?lite=1" : ""}`,
      ),
    enabled: Boolean(jobId),
  });

  // Live progress WITHOUT re-pulling the heavy job body every 5s: poll a tiny
  // status endpoint while the pipeline is active and only invalidate the full
  // job query when status/analyzedPages actually change (i.e. a page finished).
  const status = query.data?.job?.status ?? "";
  const analyzed = query.data?.job?.analyzedPages ?? 0;
  const running = query.data?.job?.runningStep ?? null;
  useQuery({
    queryKey: ["coloring", "clone-job-status", jobId],
    queryFn: async () => {
      const s = await httpGet<{ status: string; analyzedPages: number; runningStep?: string | null }>(
        `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/status`,
      );
      // runningStep is part of the comparison because a step transition (e.g.
      // trim-pdf -> reproduce) moves neither status nor analyzedPages — without
      // it the screen would keep naming the step the worker already left.
      if (
        s &&
        (s.status !== status ||
          s.analyzedPages !== analyzed ||
          (s.runningStep ?? null) !== running)
      ) {
        void qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
      }
      return s;
    },
    enabled: Boolean(jobId) && isActive(status),
    refetchInterval: (q) => (isActive(q.state.data?.status ?? status) ? 5000 : false),
  });

  return {
    job: query.data?.job,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
