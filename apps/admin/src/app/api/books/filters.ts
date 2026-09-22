import type { Prisma } from "@vx/db";
import { BLANK } from "../clone/filters";

/**
 * Lọc book theo tag. Khác phía jobs ở chỗ đây là cột scalar denormalized
 * (do trigger book_denorm_perf ghi) chứ không phải quan hệ, nên blank chỉ là
 * một phép so null đơn giản — không cần nhánh OR.
 */
export function bookTagClause(
  field: "niche" | "priority",
  value: string,
): Prisma.BookWhereInput {
  const match = value === BLANK ? null : value;
  return field === "niche" ? { niche: match } : { priority: match };
}
