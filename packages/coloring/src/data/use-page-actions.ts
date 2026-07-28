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
 *
 * `cloneJobId` (from book.data.cloneJobId) enables Regen / Đổi góc: a book page
 * maps 1:1 by index to its source clone job page, so /reproduce {pageIndex, apply:true}
 * regenerates and writes straight back onto the book page.
 */
export function usePageActions(bookId: string, cloneJobId?: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const put = async (data: Record<string, unknown>) => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, data);
    inval();
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** Whether Regen/Đổi góc are available (book has a source clone job). */
    canRegen: Boolean(cloneJobId),
    /**
     * Regenerate a page via its source clone job. newAngle=false → same camera
     * ("Regen"); true → a new camera angle ("Đổi góc"). apply:true writes the
     * result onto both the job page and this book page.
     */
    regenPage: async (pageIndex: number, newAngle: boolean) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      if (!cloneJobId) throw new Error("Sách này không có clone job nguồn để regen.");
      await httpPost(`${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/reproduce`, { pageIndex, newAngle, apply: true });
      inval();
    },
    /** PUT book squareThumbnailUrl + thumbnailUrl = this page. */
    setThumbnail: (pageUrl: string) => put({ squareThumbnailUrl: pageUrl, thumbnailUrl: pageUrl }),
    /**
     * Use this page as the book's cover *source* (the clean illustration the cover
     * editor edits text onto). coverMeta lives INSIDE the Book.data JSON column (not a
     * top-level column), so we merge into the full data blob — sending coverMeta at the
     * top level makes Prisma 500. Also refresh the thumbnails so lists reflect the choice.
     */
    setCover: (pageUrl: string, currentData?: Record<string, unknown>) => {
      const currentMeta = (currentData?.coverMeta as Record<string, unknown> | undefined) ?? {};
      return put({
        data: { ...(currentData ?? {}), coverMeta: { ...currentMeta, sourceThumbnailUrl: pageUrl } },
        squareThumbnailUrl: pageUrl,
        thumbnailUrl: pageUrl,
      });
    },
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
