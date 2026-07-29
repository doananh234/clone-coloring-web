"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

export interface ColorizePage {
  id: string;
  url: string;
}

/**
 * Batch-colorize a book's pages. Colorize is per-page (POST /coloring-styles/colorize),
 * so we loop sequentially to avoid hammering the AI backend. Behind the write flag;
 * local mode throws (real AI generation — no safe local equivalent).
 */
export function useColorizeBook(bookId: string): (
  styleId: string,
  pages: ColorizePage[],
  onProgress: (done: number, total: number) => void,
  useReference?: boolean,
) => Promise<{ done: number; failed: number }> {
  const qc = useQueryClient();
  return async (styleId, pages, onProgress, useReference = true) => {
    if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
    let done = 0;
    let failed = 0;
    for (const p of pages) {
      try {
        await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, {
          imageUrl: p.url,
          coloringStyleId: styleId,
          bookId,
          pageId: p.id,
          useReference,
        });
      } catch {
        failed++;
      }
      done++;
      onProgress(done, pages.length);
    }
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    return { done, failed };
  };
}
