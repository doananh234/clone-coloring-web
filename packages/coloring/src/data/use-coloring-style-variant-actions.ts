"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/**
 * Delete a single color variant from a ColoringStyle (see the API route at
 * /api/coloring-styles/[id]/variants/[variantId]). `force` skips the "book still
 * uses this variant" guard. Refreshes the style detail + list on success.
 */
export function useColoringStyleVariantActions(styleId: string) {
  const qc = useQueryClient();
  const base = `${COLORING_API_BASE}/coloring-styles/${encodeURIComponent(styleId)}/variants`;
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["coloring", "entity-one", "coloring-styles", styleId] });
    qc.invalidateQueries({ queryKey: ["coloring", "entity", "coloring-styles"] });
  };
  return {
    enabled: COLORING_WRITE_ENABLED,
    removeVariant: async (variantId: string, opts?: { force?: boolean }) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      const qs = opts?.force ? "?force=true" : "";
      await httpDel(`${base}/${encodeURIComponent(variantId)}${qs}`);
      inval();
    },
  };
}
