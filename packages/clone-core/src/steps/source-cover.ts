/**
 * Trang dùng làm bìa của sách clone: chính bìa của sách GỐC (ảnh render từ PDF
 * nguồn, `imageUrl`) — không phải bản redesign, không tự gen bìa AI.
 *
 * Thứ tự: trang được phân loại `pageType: "cover"`; nếu chưa phân loại (job cũ,
 * hoặc operator không đánh dấu) thì trang gốc có số nhỏ nhất — thường chính là
 * bìa. Bỏ qua trang bị loại / lỗi / không có ảnh, và không bao giờ lấy trang do
 * fill-interior nhân bản ra (`origin: "additional"`).
 */
export interface SourceCoverCandidate {
  pageNumber: number;
  imageUrl?: string | null;
  pageType?: string | null;
  excluded?: boolean;
  status?: string;
  origin?: string;
}

export function pickSourceCoverPage<T extends SourceCoverCandidate>(pages: readonly T[]): T | null {
  const usable = pages
    .filter((p) => !p.excluded && p.status !== "error" && !!p.imageUrl && p.origin !== "additional")
    .sort((a, b) => a.pageNumber - b.pageNumber);
  return usable.find((p) => p.pageType === "cover") ?? usable[0] ?? null;
}
