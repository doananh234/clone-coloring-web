"use client";

import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

/**
 * Per-element STYLE + LAYOUT extracted from the source cover (mirrors the
 * server `CoverElementExtract`). Coordinates/sizes are normalized 0..1.
 */
export interface CoverElementExtract {
  present: boolean;
  fontFamily?: string;
  fontWeight?: 400 | 500 | 600 | 700;
  color?: string;
  fontSizeNorm?: number;
  textAlign?: "left" | "center" | "right";
  xNorm?: number;
  yNorm?: number;
}

/** Cover text-style pack from /generate/cover-design (also stored on book.data.coverStylePack). */
export interface CoverStylePack {
  titles?: string[];
  subtitles?: string[];
  brandLines?: string[];
  fontPairs?: { id: string; display: string; body: string }[];
  palettes?: { id: string; name: string; background: string; primary: string; secondary: string; accent: string }[];
  layoutHint?: "centered" | "corner" | "banner-top" | "banner-bottom";
  /** Per-element extracted style + position; editor seeds slots from this. */
  elements?: {
    title?: CoverElementExtract;
    subtitle?: CoverElementExtract;
    brand?: CoverElementExtract;
    badge?: CoverElementExtract;
  };
}

export interface CoverDesignContextInput {
  title: string;
  subtitle?: string;
  brandName?: string;
  category?: string;
}

/** Analyze a cover image → fonts/palettes/layout suggestions for title/subtitle/brand. */
export function useCoverDesign() {
  return {
    enabled: COLORING_WRITE_ENABLED,
    run: async (sourceThumbnailUrl: string, bookContext: CoverDesignContextInput): Promise<CoverStylePack> => {
      if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
      return httpPost<CoverStylePack>(`${COLORING_API_BASE}/generate/cover-design`, { sourceThumbnailUrl, bookContext });
    },
  };
}
