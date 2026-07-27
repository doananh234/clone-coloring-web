"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPut } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

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
  };
}
