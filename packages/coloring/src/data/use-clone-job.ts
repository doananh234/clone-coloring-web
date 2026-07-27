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
  });

  return {
    job: query.data?.job,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
