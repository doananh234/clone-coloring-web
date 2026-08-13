"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import type { SourceCover, TitleSafePosition } from "./source-covers";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** On-demand B&W source-cover actions (gen / colorize / public / delete). */
export function useSourceCovers(bookId: string) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/source-covers`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  return {
    enabled: COLORING_WRITE_ENABLED,
    gen: async (interiorPageId: string, titleSafe: TitleSafePosition) => {
      guard();
      await httpPost(base, { interiorPageId, titleSafe });
      inval();
    },
    colorize: async (sc: SourceCover, styleId: string, variantId?: string | null) => {
      guard();
      await httpPost(`${COLORING_API_BASE}/coloring-styles/colorize`, {
        imageUrl: sc.url, coloringStyleId: styleId, coloringVariantId: variantId ?? undefined,
        bookId, pageId: sc.id, target: "sourceCover",
      });
      inval();
    },
    togglePublic: async (scId: string) => {
      guard();
      await httpPatch(base, { scId });
      inval();
    },
    remove: async (scId: string) => {
      guard();
      await httpDel(`${base}/${encodeURIComponent(scId)}`);
      inval();
    },
  };
}
