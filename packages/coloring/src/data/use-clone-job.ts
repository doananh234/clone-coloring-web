"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import type { CloneJobResponse, CloneJobDetail } from "./types";
import { COLORING_API_BASE } from "./config";

export interface UseCloneJobResult {
  job: CloneJobDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Fetch a single clone job (GET /api/clone/[jobId]). */
export function useCloneJob(jobId: string): UseCloneJobResult {
  const query = useQuery({
    queryKey: ["coloring", "clone-job", jobId],
    queryFn: () => httpGet<CloneJobResponse>(`${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}`),
    enabled: Boolean(jobId),
    // Auto-refresh while the pipeline is actively working so status/progress
    // stay live without a manual refresh. "queued" + the "*-ing" states
    // (analyzing/reproducing/colorizing/generating) are in-progress; terminal
    // and manual-checkpoint states (reproduced/analyzed/error/failed/stashed)
    // stop polling to avoid needless full-job fetches.
    refetchInterval: (q) => {
      const status = q.state.data?.job?.status ?? "";
      return status === "queued" || status.endsWith("ing") ? 5000 : false;
    },
  });

  return {
    job: query.data?.job,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
