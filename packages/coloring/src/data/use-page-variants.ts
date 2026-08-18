"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { BookDetail } from "./types";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

export interface RegenAddOpts { count: number; source: "A" | "B"; changePercent: number }

/**
 * Pure optimistic patch for variant removal. Removes the variant from the
 * page's `variants` array — but ONLY when it isn't the currently selected one:
 * deleting the selected variant makes the server pick a new pointer we can't
 * predict, so we return `null` to signal "fall back to a refetch" instead.
 */
export function applyVariantRemoval(
  book: BookDetail | undefined,
  pageId: string,
  variantId: string,
): BookDetail | null {
  if (!book?.coloringPages) return null;
  let unsafe = false;
  const coloringPages = book.coloringPages.map((p) => {
    if (p.id !== pageId) return p;
    if (p.selectedVariantId === variantId) {
      unsafe = true;
      return p;
    }
    return { ...p, variants: (p.variants ?? []).filter((v) => v.id !== variantId) };
  });
  return unsafe ? null : { ...book, coloringPages };
}

/**
 * Pure optimistic patch for variant selection. Mirrors the chosen variant into
 * the target page (selectedVariantId + url/coloredUrl) exactly like the server
 * does, so the cache can be updated instantly without a full-book refetch.
 * Returns the same reference when nothing changes (no page/variant match).
 */
export function applyVariantSelection(
  book: BookDetail | undefined,
  pageId: string,
  variantId: string,
): BookDetail | undefined {
  if (!book?.coloringPages) return book;
  return {
    ...book,
    coloringPages: book.coloringPages.map((p) => {
      if (p.id !== pageId) return p;
      const v = p.variants?.find((vv) => vv.id === variantId);
      return v
        ? { ...p, selectedVariantId: variantId, url: v.url, coloredUrl: v.coloredUrl }
        : { ...p, selectedVariantId: variantId };
    }),
  };
}

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
      // Optimistic update: the chosen variant is already in the cached book, so
      // mirror it into the page (url/coloredUrl + selectedVariantId) exactly like
      // the server does — the UI flips instantly instead of re-downloading the
      // whole book (~130KB) on every variant click. Roll back if the PATCH fails.
      const key = ["coloring", "book", bookId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BookDetail>(key);
      qc.setQueryData<BookDetail>(key, (old) => applyVariantSelection(old, pageId, variantId));
      try {
        await httpPatch(`${base}/${encodeURIComponent(pageId)}/variants`, { variantId });
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        throw e;
      }
    },
    remove: async (pageId: string, variantId: string) => {
      guard();
      // Optimistically drop a non-selected variant from the cache; if it's the
      // selected one (server reassigns the pointer), fall back to a refetch.
      const key = ["coloring", "book", bookId];
      const prev = qc.getQueryData<BookDetail>(key);
      const patched = applyVariantRemoval(prev, pageId, variantId);
      if (patched) {
        await qc.cancelQueries({ queryKey: key });
        qc.setQueryData(key, patched);
      }
      try {
        await httpDel(`${base}/${encodeURIComponent(pageId)}/variants/${encodeURIComponent(variantId)}`);
        if (!patched) inval();
      } catch (e) {
        if (patched && prev) qc.setQueryData(key, prev);
        else inval();
        throw e;
      }
    },
  };
}
