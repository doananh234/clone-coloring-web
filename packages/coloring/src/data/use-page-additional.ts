"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

export interface RegenAddOpts { count: number; source: "A" | "B"; changePercent: number }

/** Book-level "Regen Thêm": generate additional interior pages appended to the book. */
export function usePageAdditional(bookId: string) {
  const qc = useQueryClient();
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages`;
  return {
    enabled: COLORING_WRITE_ENABLED,
    regenAddPages: async (pageId: string, opts: RegenAddOpts) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpPost(`${base}/${encodeURIComponent(pageId)}/additional`, opts);
      await qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
  };
}
