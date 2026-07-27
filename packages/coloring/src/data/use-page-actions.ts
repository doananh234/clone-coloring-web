"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPut, httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { BookColoringPage } from "./types";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/**
 * Per-page actions on a book's coloring pages, replicating the existing
 * book-detail-page.tsx handlers. All behind the write flag (default local = off).
 * PUT sends real Book columns (coloringPages / squareThumbnailUrl) directly.
 */
export function usePageActions(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const put = async (data: Record<string, unknown>) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, data);
    inval();
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** PUT book squareThumbnailUrl + thumbnailUrl = this page. */
    setThumbnail: (pageUrl: string) => put({ squareThumbnailUrl: pageUrl, thumbnailUrl: pageUrl }),
    /** Flip isPublic on one page (sends the full updated array). */
    togglePublic: (pages: BookColoringPage[], pageId: string) =>
      put({ coloringPages: pages.map((p) => (p.id === pageId ? { ...p, isPublic: !p.isPublic } : p)) }),
    /** Remove one page from the book. */
    removePage: (pages: BookColoringPage[], pageId: string) =>
      put({ coloringPages: pages.filter((p) => p.id !== pageId) }),
    /** Colorize one page with a coloring style (POST /coloring-styles/colorize). */
    colorize: async (pageId: string, pageUrl: string, styleId: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, { imageUrl: pageUrl, coloringStyleId: styleId, bookId, pageId });
      inval();
    },
  };
}
