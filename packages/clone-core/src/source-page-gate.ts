/**
 * Ngưỡng số trang của sách NGUỒN. Pipeline nhắm 40 trang ruột
 * (DEFAULT_TARGET_INTERIOR), cộng bìa và một trang intro là 42 — sách nguồn
 * mỏng hơn thì clone ra cũng không đủ trang, nên dừng lại trước khi tốn tiền AI
 * và để operator xem ở tab "Sách thiếu trang".
 */
export const MIN_SOURCE_PAGES = 42;

/** Trạng thái CloneJob cho sách nguồn mỏng hơn ngưỡng. Cố ý KHÔNG tái dùng
 *  "awaiting-fill" (thuộc tính năng bổ sung trang ruột) để hai thứ độc lập. */
export const INSUFFICIENT_PAGES_STATUS = "insufficient-pages";

/**
 * `totalPages` = 0 / null nghĩa là CHƯA đếm, không phải sách mỏng — chặn ở đó
 * sẽ đẩy mọi job vừa import vào tab thiếu trang.
 */
export function isInsufficientSourcePages(
  totalPages: number | null | undefined,
  min: number = MIN_SOURCE_PAGES,
): boolean {
  if (!totalPages || totalPages <= 0) return false;
  return totalPages < min;
}
