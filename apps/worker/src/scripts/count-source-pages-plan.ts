/**
 * Phần thuần của count-source-pages.ts: từ số trang đếm được, quyết định ghi gì
 * lên CloneJob. Tách ra để test không cần PDF/DB.
 */
import {
  MIN_SOURCE_PAGES,
  INSUFFICIENT_PAGES_STATUS,
  isInsufficientSourcePages,
} from "@vx/clone-core";

export interface PageCountUpdate {
  totalPages: number;
  /** Chỉ có khi sách nguồn mỏng hơn ngưỡng. */
  status?: string;
}

/** Trả null khi số trang không dùng được (0, âm, NaN) — không ghi gì, job giữ nguyên. */
export function planPageCount(
  pages: number,
  min: number = MIN_SOURCE_PAGES,
): PageCountUpdate | null {
  if (!Number.isFinite(pages) || pages <= 0) return null;
  const totalPages = Math.trunc(pages);
  return isInsufficientSourcePages(totalPages, min)
    ? { totalPages, status: INSUFFICIENT_PAGES_STATUS }
    : { totalPages };
}
