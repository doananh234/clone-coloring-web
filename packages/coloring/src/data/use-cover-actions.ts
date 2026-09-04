"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPut } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { CoverDoc } from "../lib/cover-doc";
import type { BookDetail } from "./types";

const LOCAL = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

/**
 * Save a composed cover: upload the PNG (base64) to R2 via /generate/upload-image,
 * then PUT the returned URL onto book.coverUrl. Mirrors the old app's overlay-save
 * flow (upload-image → firestoreUpdate coverUrl). coverUrl isn't in the whitelist
 * payload mapper, so this PUTs the column directly like use-page-actions.setThumbnail.
 */
export function useSaveCover(bookId: string) {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    save: async (base64: string): Promise<string> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      const up = await httpPost<{ success?: boolean; url?: string }>(
        `${COLORING_API_BASE}/generate/upload-image`,
        { base64, key: `assets/${bookId}/cover.png` },
      );
      if (!up?.url) throw new Error("Upload ảnh bìa thất bại.");
      const coverUrl = `${up.url}?v=${Date.now()}`;
      await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, { coverUrl });
      // We know the new coverUrl — patch it into the cache directly instead of
      // refetching the whole book (~130KB) just to reflect one column.
      qc.setQueryData<BookDetail>(["coloring", "book", bookId], (old) =>
        old ? { ...old, coverUrl } : old,
      );
      return coverUrl;
    },
    saveLayout: async (doc: CoverDoc): Promise<void> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, { coverLayout: doc });
      qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
    /**
     * Persist the chosen background image so reopening the editor restores it.
     * The books PUT merges `coverMeta` into Book.data but REPLACES the whole
     * coverMeta object — so spread the existing meta to preserve other fields.
     */
    saveCoverSource: async (sourceThumbnailUrl: string, currentMeta: Record<string, unknown>): Promise<void> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, {
        coverMeta: { ...currentMeta, sourceThumbnailUrl },
      });
      qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
  };
}

export interface GeneratedCover {
  previewUrl: string;
  base64: string;
}

export interface GenerateCoverInput {
  title: string;
  /** One or more source illustrations to build the cover from. */
  imageUrls: string[];
  /** Brand/author line to print on the cover (optional). */
  brand?: string;
  /** Coloring/art style name to steer the look (optional). */
  style?: string;
  /** Title placement: "top" | "center" | "bottom" | "corner" (optional). */
  layout?: string;
}

/**
 * AI cover generation via /generate/compose-cover. The backend composes the
 * chosen illustration(s) + title into ONE cover image and returns a base64 PNG.
 * Brand / style / layout steer the generated prompt.
 */
export function useGenerateCover() {
  return {
    enabled: COLORING_WRITE_ENABLED,
    generate: async (input: GenerateCoverInput): Promise<GeneratedCover> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      const res = await httpPost<{ success?: boolean; previewUrl?: string; base64?: string }>(
        `${COLORING_API_BASE}/generate/compose-cover`,
        {
          title: input.title,
          imageDataUrls: input.imageUrls,
          brand: input.brand,
          style: input.style,
          layout: input.layout,
        },
      );
      if (!res?.base64) throw new Error("Gen bìa AI thất bại (thiếu ảnh trả về).");
      return { previewUrl: res.previewUrl || `data:image/png;base64,${res.base64}`, base64: res.base64 };
    },
  };
}
