"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPatch } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

export type PageType = "cover" | "interiorIntro" | "interior";
export type ClassifyEdit = { pageNumber: number; pageType?: PageType; excluded?: boolean };

/** Pure payload builder — unit-tested without a live client. */
export function buildClassifyPayload(edits: ClassifyEdit[], confirm: boolean) {
  return { pages: edits, confirm };
}

/** PATCH /clone/[jobId]/classify — save page classifications, optionally confirm+resume. */
export function useClassifyGate(jobId: string) {
  const qc = useQueryClient();
  const send = async (edits: ClassifyEdit[], confirm: boolean) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPatch(
      `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/classify`,
      buildClassifyPayload(edits, confirm),
    );
    qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
  };
  return {
    save: (edits: ClassifyEdit[]) => send(edits, false),
    confirm: (edits: ClassifyEdit[]) => send(edits, true),
  };
}
