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
     * Generate a candidate via the source clone job WITHOUT applying it, so the user
     * can preview + choose. newAngle=false → "Regen" (same camera, regenCandidateUrl);
     * true → "Đổi góc" (new camera, angleCandidateUrl). Returns the candidate image url
     * (from the reproduce response) — the book page is NOT changed yet.
     */
    genCandidate: async (pageIndex: number, newAngle: boolean): Promise<{ url: string; cameraView?: string }> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      if (!cloneJobId) throw new Error("Sách này không có clone job nguồn để regen.");
      const res = await httpPost<{ results?: { url?: string; cameraView?: string }[] }>(
        `${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/reproduce`,
        { pageIndex, newAngle, apply: false },
      );
      const r = res?.results?.[0];
      if (!r?.url) throw new Error("Không tạo được bản mới.");
      return { url: r.url, cameraView: r.cameraView };
    },
    /**
     * Apply a previously generated candidate to this page (sets the job page's
     * reproducedUrl AND updates the book page image). kind "regen" | "angle".
     */
    applyCandidate: async (pageIndex: number, kind: "regen" | "angle") => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      if (!cloneJobId) throw new Error("Sách này không có clone job nguồn.");
      await httpPost(`${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/apply-candidate`, { pageIndex, kind });
      inval();
    },
    // The 3 old lightbox actions ("Set Colored as …"), each on its own column:
    /** Set the book COVER image (coverUrl). */
    setCover: (pageUrl: string) => put({ coverUrl: pageUrl }),
    /** Set the 3:4 list thumbnail (thumbnailUrl). */
    setThumbnail: (pageUrl: string) => put({ thumbnailUrl: pageUrl }),
    /** Set the square (1:1) thumbnail (squareThumbnailUrl). */
    setSquare: (pageUrl: string) => put({ squareThumbnailUrl: pageUrl }),
    /** Flip isPublic on one page (sends the full updated array). */
    togglePublic: (pages: BookColoringPage[], pageId: string) =>
      put({ coloringPages: pages.map((p) => (p.id === pageId ? { ...p, isPublic: !p.isPublic } : p)) }),
    /** Remove one page from the book. */
    removePage: (pages: BookColoringPage[], pageId: string) =>
      put({ coloringPages: pages.filter((p) => p.id !== pageId) }),
    /** Colorize one page with a coloring style + optional color variant. */
    colorize: async (pageId: string, pageUrl: string, styleId: string, variantId?: string | null) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, {
        imageUrl: pageUrl,
        coloringStyleId: styleId,
        coloringVariantId: variantId ?? undefined,
        bookId,
        pageId,
      });
      inval();
    },
  };
}
