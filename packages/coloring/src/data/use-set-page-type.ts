"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { BookPageType } from "./page-type";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Re-classify a book page (cover/intro/interior), then refresh the book cache. */
export function useSetPageType(bookId: string) {
  const qc = useQueryClient();
  return async (pageId: string, type: BookPageType) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPost(
      `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages/${encodeURIComponent(pageId)}/page-type`,
      { type },
    );
    await qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  };
}
