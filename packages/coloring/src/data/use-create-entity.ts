"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

/**
 * Generic "create new" for simple entities (books, brands, categories).
 * Behind the write flag. Returns the new id when available.
 */
export function useCreateEntity(kind: "books" | "brands" | "categories") {
  const qc = useQueryClient();
  return {
    enabled: COLORING_WRITE_ENABLED,
    create: async (data: Record<string, unknown>): Promise<{ id?: string }> => {
      if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
      const res = await httpPost<{ id?: string; data?: { id?: string } }>(`${COLORING_API_BASE}/${kind}`, data);
      qc.invalidateQueries({ queryKey: ["coloring", kind === "books" ? "books" : "entity", kind] });
      return { id: res.id ?? res.data?.id };
    },
  };
}
