/**
 * Đổi bìa của các sách ĐÃ clone sang bìa của sách gốc — cùng quy tắc với
 * stepCreateBook mới (pickSourceCoverPage: trang pageType "cover", không có thì
 * trang gốc số nhỏ nhất; dùng ảnh gốc `imageUrl`, không phải bản redesign).
 *
 * An toàn / đảo ngược được:
 *   - Ảnh được copy sang assets/{bookId}/source-cover.{ext} — KHÔNG đè
 *     assets/{bookId}/cover.png (chỗ finalize-cover đã lưu bìa AI).
 *   - Bìa hiện tại được giữ lại thành một Cover Candidate; bìa gốc được thêm
 *     (origin "original", nhãn "Bìa gốc") và chọn. Muốn quay lại: bấm "Chọn làm
 *     bìa" trên candidate cũ ở màn chi tiết sách.
 *   - Idempotent: sách đã có candidate "original" thì bỏ qua.
 *   - thumbnailUrl / squareThumbnailUrl giữ nguyên (cover editor dùng làm ảnh nền).
 *
 * Usage — trên prod chạy tsx trực tiếp trong container (KHÔNG `yarn`, xem ghi
 * chú prod-maintenance-script-env-trap):
 *   tsx src/scripts/backfill-source-cover.ts                 # DRY RUN (mặc định)
 *   tsx src/scripts/backfill-source-cover.ts --apply         # ghi thật
 *   tsx src/scripts/backfill-source-cover.ts --skip-manual   # bỏ qua sách đang dùng bìa tự chọn (Push)
 *   tsx src/scripts/backfill-source-cover.ts --book <id>     # chỉ một sách
 *   tsx src/scripts/backfill-source-cover.ts --limit 5
 */
import crypto from "node:crypto";
import { getR2Config, createR2Client, copyR2Object, resolveR2Url } from "@vx/server-core/r2";
import type { SourceCoverCandidate } from "@vx/clone-core/steps";
import type { CoverState } from "@vx/coloring/data/cover-candidates";
import { db } from "../db";
import { planSourceCover, withSourceCoverSelected } from "./source-cover-backfill-plan";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SKIP_MANUAL = args.includes("--skip-manual");
const argVal = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY_BOOK = argVal("--book");
const LIMIT = argVal("--limit") ? Number(argVal("--limit")) : Infinity;

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function log(msg: string) {
  console.log(`[backfill-source-cover]${APPLY ? "" : " [dry-run]"} ${msg}`);
}

/** Cover đang hiển thị là loại gì — để báo cáo và cho --skip-manual. */
function currentCoverKind(data: Rec): "manual-push" | "auto-ai" | "other" {
  const cands = Array.isArray(data.coverCandidates) ? (data.coverCandidates as Rec[]) : [];
  const selected = cands.find((c) => c.id === data.selectedCoverCandidateId);
  if (selected?.origin === "pushed") return "manual-push";
  const meta = isObj(data.coverMeta) ? data.coverMeta : {};
  if (meta.status === "generated") return "auto-ai";
  return "other";
}

const toKey = (url: string) => url.replace(/^\//, "").split("?")[0];
const isExternal = (url: string) => /^https?:\/\//.test(url);

async function sourceExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(isExternal(url) ? url : resolveR2Url(`/${toKey(url)}`), { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const r2Config = getR2Config();
  const r2Client = createR2Client(r2Config);

  const books = (
    await db.book.findMany({
      where: ONLY_BOOK ? { id: ONLY_BOOK } : undefined,
      select: { id: true, title: true, coverUrl: true, data: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter((b) => {
    const d = isObj(b.data) ? b.data : {};
    return str(d.cloneJobId) || str(d.sourceCloneJobId);
  });
  log(`${books.length} sách có clone job nguồn`);

  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const kinds: Record<string, number> = {};
  let processed = 0;

  // Job pages là JSON nặng — đọc theo lô.
  const CHUNK = 25;
  for (let i = 0; i < books.length && processed < LIMIT; i += CHUNK) {
    const chunk = books.slice(i, i + CHUNK);
    const jobIds = chunk.map((b) => {
      const d = b.data as Rec;
      return (str(d.cloneJobId) || str(d.sourceCloneJobId))!;
    });
    const jobs = await db.cloneJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, pages: true } });
    const pagesByJob = new Map(jobs.map((j) => [j.id, (j.pages as unknown as SourceCoverCandidate[]) ?? []]));

    for (const book of chunk) {
      if (processed >= LIMIT) break;
      processed++;
      const data = book.data as Rec;
      const jobId = (str(data.cloneJobId) || str(data.sourceCloneJobId))!;
      const kind = currentCoverKind(data);
      kinds[kind] = (kinds[kind] ?? 0) + 1;

      if (!pagesByJob.has(jobId)) {
        bump("skip:job-missing");
        continue;
      }
      if (SKIP_MANUAL && kind === "manual-push") {
        bump("skip:manual-push");
        continue;
      }
      const plan = planSourceCover(book, pagesByJob.get(jobId)!);
      if (plan.action === "skip") {
        bump(`skip:${plan.reason}`);
        continue;
      }
      if (!(await sourceExists(plan.sourceUrl))) {
        bump("skip:source-image-missing");
        log(`  ${book.id} "${book.title}" — ảnh nguồn không còn: ${plan.sourceUrl}`);
        continue;
      }

      if (!APPLY) {
        bump(`would-change:${kind}`);
        if ((counts[`would-change:${kind}`] ?? 0) <= 3) log(`  ${book.id} "${book.title}" (${kind}) ← ${plan.sourceUrl}`);
        continue;
      }

      try {
        const newUrl = isExternal(plan.sourceUrl)
          ? plan.sourceUrl
          : (await copyR2Object({ client: r2Client, config: r2Config, sourceKey: toKey(plan.sourceUrl), destKey: plan.destKey })).url;
        // Đọc lại data ngay trước khi ghi để không đè thay đổi xảy ra trong lúc chạy.
        const fresh = await db.book.findUnique({ where: { id: book.id }, select: { coverUrl: true, data: true } });
        if (!fresh) {
          bump("skip:book-gone");
          continue;
        }
        const freshData = (fresh.data as Rec | null) ?? {};
        const state: CoverState = {
          coverUrl: fresh.coverUrl || undefined,
          coverCandidates: freshData.coverCandidates as CoverState["coverCandidates"],
          selectedCoverCandidateId: freshData.selectedCoverCandidateId as string | undefined,
        };
        const next = withSourceCoverSelected(state, newUrl, () => crypto.randomUUID(), new Date().toISOString());
        await db.book.update({
          where: { id: book.id },
          data: {
            coverUrl: next.coverUrl ?? "",
            data: {
              ...freshData,
              coverCandidates: next.coverCandidates,
              selectedCoverCandidateId: next.selectedCoverCandidateId,
            } as never,
          },
        });
        bump(`changed:${kind}`);
      } catch (err) {
        bump("error");
        log(`  ERROR ${book.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  log(`bìa hiện tại theo loại: ${JSON.stringify(kinds)}`);
  log(`kết quả: ${JSON.stringify(counts)}`);
  if (!APPLY) log("Dry run — chưa ghi gì. Thêm --apply để ghi thật.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
