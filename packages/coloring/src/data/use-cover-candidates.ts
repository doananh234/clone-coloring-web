"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** D4c: non-destructive cover-candidate actions (push / select / delete). */
export function useCoverCandidates(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/cover-candidates`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** Push a page's colored image to Cover: adds a candidate and auto-selects it. */
    push: async (pageId: string, coloredUrl: string) => {
      guard();
      await httpPost(base, { url: coloredUrl, fromPageId: pageId });
      inval();
    },
    select: async (candidateId: string) => {
      guard();
      await httpPatch(base, { candidateId });
      inval();
    },
    remove: async (candidateId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(candidateId)}`);
      inval();
    },
  };
}
