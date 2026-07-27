"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPut, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Entity-detail actions (regenerate reference image, delete). Behind the write flag. */
export function useEntityActions(kind: string, id: string) {
  const qc = useQueryClient();
  const base = `${COLORING_API_BASE}/${kind}/${encodeURIComponent(id)}`;
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["coloring", "entity-one", kind, id] });
    qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** PUT { regenerateReference:true } → regenerate the character/location reference image. */
    regenerateReference: async (redesignPrompt?: string) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpPut(base, { regenerateReference: true, redesignPrompt: redesignPrompt || undefined });
      inval();
    },
    /** DELETE the entity. */
    remove: async () => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await httpDel(base);
      inval();
    },
  };
}
