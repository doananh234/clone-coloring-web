"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

/** POST /clone/[jobId]/create-book → creates a real Book. Returns its id. */
export function useCreateBook(jobId: string): () => Promise<string> {
  const qc = useQueryClient();
  return async () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    const res = await httpPost<{ success: boolean; bookId: string }>(
      `${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/create-book`,
      { useRedesigned: true },
    );
    qc.invalidateQueries({ queryKey: ["coloring", "clone-job", jobId] });
    qc.invalidateQueries({ queryKey: ["coloring", "books"] });
    return res.bookId;
  };
}

/** POST /clone/[jobId]/extract-entities (empty = extract all detected). */
export function useExtractEntities(jobId: string): () => Promise<void> {
  const qc = useQueryClient();
  return async () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPost(`${COLORING_API_BASE}/clone/${encodeURIComponent(jobId)}/extract-entities`, {});
    qc.invalidateQueries({ queryKey: ["coloring", "entity", "characters"] });
    qc.invalidateQueries({ queryKey: ["coloring", "entity", "locations"] });
  };
}
