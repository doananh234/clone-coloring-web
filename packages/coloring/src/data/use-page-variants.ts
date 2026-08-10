"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

export interface RegenAddOpts { count: number; source: "A" | "B"; changePercent: number }

/** D4b: non-destructive per-page variant actions (regen-add / select / delete). */
export function usePageVariants(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    regenAdd: async (pageId: string, opts: RegenAddOpts) => {
      guard();
      await httpPost(`${base}/${encodeURIComponent(pageId)}/variants`, opts);
      inval();
    },
    select: async (pageId: string, variantId: string) => {
      guard();
      await httpPatch(`${base}/${encodeURIComponent(pageId)}/variants`, { variantId });
      inval();
    },
    remove: async (pageId: string, variantId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(pageId)}/variants/${encodeURIComponent(variantId)}`);
      inval();
    },
  };
}
