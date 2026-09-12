import { prisma } from "@vx/db";

/**
 * Đọc niche/priority của SourceBook nguồn để stamp vào Book.data lúc tạo book.
 *
 * WHY: trước đây chỉ script backfill mới ghi Book.data.niche, nên mọi book tạo
 * mới đều không có niche và filter trên trang Books mục ruỗng dần theo thời
 * gian. Gọi hàm này ở mọi nơi tạo book từ clone job để backfill trở thành việc
 * chạy một lần cho dữ liệu cũ.
 *
 * Chỉ trả về khoá có giá trị thật — spread một object rỗng vào Book.data sẽ
 * không tạo ra khoá rỗng, và trigger book_denorm_perf sẽ để cột scalar NULL.
 *
 * Không bao giờ ném lỗi: thiếu một cái tag không đáng làm hỏng việc tạo book.
 * Nhưng có log — book mới bỗng dưng mất tag phải truy được về nguyên nhân,
 * chứ không im lặng biến mất.
 */
export async function readSourceTags(
  jobId: string,
): Promise<{ niche?: string; priority?: string }> {
  try {
    const row = await prisma.cloneJob.findUnique({
      where: { id: jobId },
      select: { sourceBook: { select: { niche: true, priority: true } } },
    });

    const out: { niche?: string; priority?: string } = {};
    const niche = row?.sourceBook?.niche?.trim();
    const priority = row?.sourceBook?.priority?.trim();
    if (niche) out.niche = niche;
    if (priority) out.priority = priority;
    return out;
  } catch (error) {
    console.error("DEBUG-CATCH-HIT"); console.warn(
      `[source-tags] không đọc được tag của job ${jobId}; book sẽ được tạo không có niche/priority:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}
