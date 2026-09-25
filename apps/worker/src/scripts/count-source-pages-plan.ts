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

/**
 * URL PDF trong DB chứa dấu cách và ký tự có dấu ("Búsqueda y Plática"), S3 trả
 * 404 nếu gửi thô. `new URL()` đã percent-encode sẵn phần path, nên chỉ cần
 * chuẩn hoá qua nó — KHÔNG encodeURIComponent thêm lần nữa, vì như vậy "%" của
 * URL đã encode sẽ thành "%25" và cũng 404.
 */
export function encodePdfUrl(raw: string): string {
  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}
