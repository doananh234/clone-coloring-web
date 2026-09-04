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

  /** Regen from the page's CURRENT image (no clone job needed) — preview only.
   *  Optional `artStyleId` = a B&W style whose reference images + directive guide it. */
  const genFromImage = async (
    pageId: string,
    newAngle: boolean,
    artStyleId?: string,
    instructions?: string,
  ): Promise<{ url: string; cameraView?: string; viaJob: false }> => {
    const res = await httpPost<{ url?: string; cameraView?: string }>(
      `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages/${encodeURIComponent(pageId)}/regen`,
      { newAngle, artStyleId: artStyleId || undefined, instructions: instructions || undefined },
    );
    if (!res?.url) throw new Error("Không tạo được bản mới từ ảnh hiện tại.");
    return { url: res.url, cameraView: res.cameraView, viaJob: false };
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** Regen/Đổi góc are always available: job when present, else from the image. */
    canRegen: true,
    /**
     * Generate a candidate WITHOUT applying it, so the user can preview + choose.
     * With a source clone job → /reproduce (regen / new camera). Without a job (or
     * if the job no longer exists → 404) → fall back to regenerating from the
     * page's CURRENT image. `viaJob` tells the caller which apply path to use.
     */
    genCandidate: async (pageIndex: number, newAngle: boolean, pageId: string, artStyleId?: string, instructions?: string): Promise<{ url: string; cameraView?: string; viaJob: boolean }> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      // A chosen B&W style OR user-typed edit instructions can only be honored by
      // the image path (reproduce/clone-job has no style/instruction input), so
      // either one forces regen-from-image.
      if (artStyleId || instructions) return genFromImage(pageId, newAngle, artStyleId, instructions);
      if (!cloneJobId) return genFromImage(pageId, newAngle);
      try {
        const res = await httpPost<{ results?: { url?: string; cameraView?: string }[] }>(
          `${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/reproduce`,
          // No B&W style chosen here → keep the page's own nét vẽ (faithful clone),
          // not a redesign variation. Only "đổi góc" changes the camera.
          { pageIndex, newAngle, apply: false, preserveStyle: true },
        );
        const r = res?.results?.[0];
        if (!r?.url) throw new Error("no candidate");
        return { url: r.url, cameraView: r.cameraView, viaJob: true };
      } catch {
        // Clone job missing (404) or reproduce failed → regen from current image.
        return genFromImage(pageId, newAngle);
      }
    },
    /** Apply an image-regen candidate (no job): set the page's line-art url. */
    applyImageCandidate: async (pages: BookColoringPage[], pageId: string, url: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      // New line art → the old colored version is stale; clear it so the page
      // shows the regenerated B&W until re-colorized.
      await put({
        coloringPages: pages.map((p) => (p.id === pageId ? { ...p, url, coloredUrl: undefined } : p)),
      });
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
    /**
     * Regen one page (same camera, from the original source) AND write it straight
     * onto the book page in a single call — the reproduce endpoint does regen +
     * apply when `apply:true`, so there is no preview/confirm step. Used by batch
     * regen. Does NOT invalidate per call (the batch invalidates once at the end).
     */
    regenApply: async (pageIndex: number) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      if (!cloneJobId) throw new Error("Sách này không có clone job nguồn.");
      const res = await httpPost<{ succeeded?: number; results?: { error?: string }[] }>(
        `${COLORING_API_BASE}/clone/${encodeURIComponent(cloneJobId)}/reproduce`,
        { pageIndex, newAngle: false, apply: true },
      );
      if (!res?.succeeded) throw new Error(res?.results?.[0]?.error || "Regen thất bại.");
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
    /** Persist a new interior page order (drag-drop reorder → full array). */
    reorderPages: (ordered: BookColoringPage[]) => put({ coloringPages: ordered }),
    /** Generate a "self-drawing" animation MP4 for one page (via @vx/motion). */
    animate: async (pageId: string, opts?: { format?: "9:16" | "1:1" | "16:9"; durationSec?: number }): Promise<string> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      const res = await httpPost<{ url?: string }>(
        `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages/${encodeURIComponent(pageId)}/animate`,
        opts ?? {},
      );
      if (!res?.url) throw new Error("Không tạo được animation.");
      inval();
      return res.url;
    },
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
