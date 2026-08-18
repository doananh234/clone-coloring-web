"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import { uploadImageFile } from "./use-upload-image";
import { resolveImg } from "./img";

const LOCAL = "Chỉ chạy ở chế độ ghi thật (staging).";
const guard = () => {
  if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL);
};

/** Analyze 1-3 images → parsed style, then create it. For extractbw/extractcolor. */
export function useStyleFromImage(kind: "art-styles" | "coloring-styles") {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    analyze: async (imageUrls: string[]): Promise<Record<string, unknown>> => {
      guard();
      return httpPost<Record<string, unknown>>(`${COLORING_API_BASE}/${kind}/analyze`, { imageUrls });
    },
    /** Upload a local image file to R2 and return its public URL (for the analyze step). */
    upload: (file: File): Promise<string> => uploadImageFile(file, `extract/${kind}`),
    create: async (data: Record<string, unknown>): Promise<{ id?: string }> => {
      guard();
      const res = await httpPost<{ id?: string; data?: { id?: string } }>(`${COLORING_API_BASE}/${kind}`, data);
      qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
      return { id: res.id ?? res.data?.id };
    },
  };
}

/** Test a style: art-styles/test-generate or coloring-styles/test-colorize.
 *  Returns an absolute preview URL (endpoints now upload to R2 and return a
 *  `url`; `dataUrl`/`previewUrl` kept as fallbacks for older responses). */
export function useStyleTest(kind: "art-styles" | "coloring-styles") {
  return {
    enabled: COLORING_WRITE_ENABLED,
    test: async (payload: { prompt?: string; generationDirective?: string; imageUrl?: string; colorizationDirective?: string; referenceImageUrls?: string[] }): Promise<string> => {
      guard();
      const path = kind === "art-styles" ? "test-generate" : "test-colorize";
      const res = await httpPost<{ url?: string; dataUrl?: string; previewUrl?: string }>(`${COLORING_API_BASE}/${kind}/${path}`, payload);
      return resolveImg(res.url || res.previewUrl) || res.dataUrl || "";
    },
  };
}

/** Category icon generation (categories/generate-icon). */
export function useCategoryIcon() {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    generate: async (categoryId: string, prompt: string) => {
      guard();
      await httpPost(`${COLORING_API_BASE}/categories/generate-icon`, { categoryId, prompt, action: "save" });
      qc.invalidateQueries({ queryKey: ["coloring", "entity-one", "categories", categoryId] });
    },
  };
}

/** Book AI meta (generate/book-meta) + sync categories. */
export function useBookAi(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  return {
    enabled: COLORING_WRITE_ENABLED,
    genMeta: async (thumbnailUrl?: string) => {
      guard();
      const res = await httpPost<{ success: boolean; data: Record<string, unknown> }>(`${COLORING_API_BASE}/generate/book-meta`, { thumbnailUrl });
      inval();
      return res.data;
    },
    syncCategories: async () => {
      guard();
      await httpPost(`${COLORING_API_BASE}/books/sync-categories`, {});
      inval();
    },
  };
}

/** Regenerate missing reference images for characters/locations (list-level). */
export function useRegenerateMissing() {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    run: async (type: "character" | "location") => {
      guard();
      await httpPost(`${COLORING_API_BASE}/extract/regenerate-missing`, { type });
      qc.invalidateQueries({ queryKey: ["coloring", "entity", type === "character" ? "characters" : "locations"] });
    },
  };
}
