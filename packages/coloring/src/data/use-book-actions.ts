"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (bật NEXT_PUBLIC_COLORING_WRITE=1, upstream staging).";

/** POST /books/[id]/generate-pdf → builds PDF from cover+pages, updates book.pdfUrl. */
export function useGeneratePdf(bookId: string): () => Promise<string | undefined> {
  const qc = useQueryClient();
  return async () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    const res = await httpPost<{ success?: boolean; pdfUrl?: string }>(
      `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/generate-pdf`,
      {},
    );
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
    return res?.pdfUrl;
  };
}

/** POST /books/[id]/generate-subtitle → AI subtitle, updates book.subtitle. */
export function useGenerateSubtitle(bookId: string): () => Promise<void> {
  const qc = useQueryClient();
  return async () => {
    if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY);
    await httpPost(`${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/generate-subtitle`, {});
    qc.invalidateQueries({ queryKey: ["coloring", "book", bookId] });
  };
}
