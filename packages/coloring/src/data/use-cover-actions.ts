"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPut } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { CoverDoc } from "../lib/cover-doc";

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
      qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
      return coverUrl;
    },
    saveLayout: async (doc: CoverDoc): Promise<void> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      await httpPut(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}`, { coverLayout: doc });
      qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    },
  };
}

export interface GeneratedCover {
  previewUrl: string;
  base64: string;
}

/**
 * AI cover generation via /generate/compose-cover. The backend composes the book's
 * colored pages + title into one cover image and returns a base64 PNG. Any extra
 * prompt is folded into the title (the endpoint only takes { title, imageDataUrls }).
 */
export function useGenerateCover() {
  return {
    enabled: COLORING_WRITE_ENABLED,
    generate: async (title: string, imageUrls: string[]): Promise<GeneratedCover> => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
      const res = await httpPost<{ success?: boolean; previewUrl?: string; base64?: string }>(
        `${COLORING_API_BASE}/generate/compose-cover`,
        { title, imageDataUrls: imageUrls },
      );
      if (!res?.base64) throw new Error("Gen bìa AI thất bại (thiếu ảnh trả về).");
      return { previewUrl: res.previewUrl || `data:image/png;base64,${res.base64}`, base64: res.base64 };
    },
  };
}
