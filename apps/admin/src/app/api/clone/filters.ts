import type { Prisma } from "@vx/db";

/**
 * Giá trị dropdown gửi lên cho "chưa gắn". Phải khớp cả hai trường hợp: job
 * chưa nối được SourceBook, và job có SourceBook nhưng field null. Lọc quan hệ
 * to-one nullable bằng `is` sẽ loại luôn row có sourceBookId NULL, nên nhánh OR
 * thứ nhất là bắt buộc — và đó là nhánh phủ 2038/2038 job đang pending.
 */
export const BLANK = "__blank__";

type TagField = "niche" | "priority";

function tagClause(field: TagField, value: string): Prisma.CloneJobWhereInput {
  if (value === BLANK) {
    return {
      OR: [
        { sourceBookId: null },
        { sourceBook: { is: field === "niche" ? { niche: null } : { priority: null } } },
      ],
    };
  }
  return {
    sourceBook: { is: field === "niche" ? { niche: value } : { priority: value } },
  };
}

export interface CloneJobFilters {
  status?: string | null;
  niche?: string | null;
  priority?: string | null;
}

/** Dựng `where` cho list jobs. Trả undefined khi không lọc gì (giữ nguyên
 *  đường nhanh cũ: Prisma bỏ qua `where` hoàn toàn). */
export function buildCloneJobWhere(f: CloneJobFilters): Prisma.CloneJobWhereInput | undefined {
  const and: Prisma.CloneJobWhereInput[] = [];
  if (f.status && f.status !== "all") and.push({ status: f.status });
  if (f.niche) and.push(tagClause("niche", f.niche));
  if (f.priority) and.push(tagClause("priority", f.priority));
  return and.length ? { AND: and } : undefined;
}
