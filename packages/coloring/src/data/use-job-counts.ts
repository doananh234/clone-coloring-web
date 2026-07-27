"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import type { CloneJobsResponse } from "./types";

/**
 * Server-grouped clone-job counts by raw status (across ALL rows). Lightweight:
 * `?limit=1` so the payload is tiny — only `counts` is used. Shared/cached (5 min)
 * so the always-mounted sidebar + header don't each hit the API.
 */
export function useJobCounts(): Record<string, number> {
  const query = useQuery({
    queryKey: ["coloring", "job-counts"],
    queryFn: () => httpGet<CloneJobsResponse>(`${COLORING_API_BASE}/clone?limit=1`),
  });
  return query.data?.counts ?? {};
}

/** Jobs currently processing (running + analyzing) — the "đang chạy" activity count. */
export function runningJobCount(counts: Record<string, number>): number {
  return (counts.running ?? 0) + (counts.analyzing ?? 0);
}

/**
 * Jobs that need the operator to act — errors (retry) + waiting-for-confirm
 * (analyzed/confirmed/entities_ready → create book). Drives the sidebar badge:
 * a small, persistent "needs attention" number rather than the often-zero running count.
 */
export function attentionJobCount(counts: Record<string, number>): number {
  return (counts.error ?? 0) + (counts.analyzed ?? 0) + (counts.confirmed ?? 0) + (counts.entities_ready ?? 0);
}
