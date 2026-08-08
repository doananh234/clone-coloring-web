"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Bulk-delete N entities of `kind` (one DELETE per id, parallel), then refresh the list. */
export function useEntityBulkDelete(kind: string) {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    removeMany: async (ids: string[]) => {
      if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
      await Promise.all(
        ids.map((id) => httpDel(`${COLORING_API_BASE}/${kind}/${encodeURIComponent(id)}`)),
      );
      qc.invalidateQueries({ queryKey: ["coloring", "entity", kind] });
    },
  };
}
