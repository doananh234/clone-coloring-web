"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Candidate kinds accepted by apply-candidate. */
export type CandidateKind = "regen" | "angle" | "redesign";

/**
 * Job pipeline + per-page actions from the old clone-page, beyond the queue
 * actions. All behind the write flag (mutate real jobs + AI cost).
 */
export function usePipelineActions(jobId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });

  const post = async (path: string, body?: unknown) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPost(`${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}${path}`, body ?? {});
    inval();
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    // job-level
    analyze: () => post(`/analyze`),
    reproduce: () => post(`/reproduce`),
    recheck: () => post(`/recheck`),
    syncOriginal: () => post(`/sync-original`),
    // per-page
    regenPage: (pageIndex: number, changePercent = 30) => post(`/redesign-page`, { pageIndex, changePercent }),
    applyCandidate: (pageIndex: number, kind: CandidateKind) => post(`/apply-candidate`, { pageIndex, kind }),
  };
}
