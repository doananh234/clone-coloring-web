"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpGet, httpPost, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";
export const DEFAULT_INTERIOR_TARGET = 40;

export interface RegenAddOpts { count: number; source: "A" | "B" | "story" | "character"; changePercent: number }

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
    /**
     * Keep appending additional interior pages until the book reaches `target`.
     *
     * Uses CHARACTER mode: the backend extracts the book's recurring main character
     * as a clean reference sheet, then invents a fresh, deduped batch of diverse
     * scenes and redraws that character into each — so filled pages keep the book's
     * character but do NOT stick to old compositions/stories (redesign made near-
     * identical pages; single-anchor story collapsed onto one scene). Chunked so
     * each request stays under the route timeout; reports progress.
     */
    fillToTarget: async (opts: {
      target?: number;
      source?: "A" | "B" | "story" | "character";
      chunk?: number;
      onProgress?: (current: number, target: number) => void;
    } = {}) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      const target = opts.target ?? DEFAULT_INTERIOR_TARGET;
      const chunk = Math.max(1, Math.min(4, opts.chunk ?? 3));
      const source = opts.source ?? "character";
      // Hard cap on rounds so a stalled backend can never loop forever.
      for (let round = 0; round < 60; round++) {
        const book = await httpGet<{ coloringPages?: { id: string; origin?: string }[] }>(
          `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`,
        );
        const pages = book.coloringPages ?? [];
        opts.onProgress?.(pages.length, target);
        if (pages.length >= target) break;
        // Prefer the ORIGINAL pages as sources (they hold the book's true
        // characters/scenes); round-robin a different one each round for variety.
        const originals = pages.filter((p) => p.origin !== "additional");
        const pool = originals.length ? originals : pages;
        const srcId = pool[round % pool.length]?.id;
        if (!srcId) break;
        const count = Math.min(chunk, target - pages.length);
        const res = await httpPost<{ added?: number }>(
          `${base}/${encodeURIComponent(srcId)}/additional`,
          { source, count },
        );
        if (!res?.added) break; // no progress → stop instead of looping
      }
      await qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
    /** Remove ALL additional (origin:"additional") pages — clean up bad fills. */
    purgeAdditional: async () => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      const res = await httpDel<{ removed?: number }>(
        `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/pages/additional`,
      );
      await qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
      return res?.removed ?? 0;
    },
  };
}
