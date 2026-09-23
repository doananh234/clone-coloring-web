/**
 * Đếm số trang của PDF nguồn cho các clone job chưa biết (`totalPages = 0`) và
 * ghi vào `CloneJob.totalPages`, để tab Queue hiện được sách dày hay mỏng TRƯỚC
 * khi cho chạy. Sách nguồn mỏng hơn MIN_SOURCE_PAGES (42) thì chuyển sang
 * trạng thái `insufficient-pages` — tab "Sách thiếu trang" — và không chạy nữa.
 *
 * Chỉ TẢI + ĐỌC số trang, không render, không gọi AI. PDF nguồn ~27–38 MB, tải
 * từ S3 về EC2 cùng vùng us-east-1 mất ~1s/file.
 *
 * Idempotent: job đã có totalPages > 0 không bị đụng tới. Chạy lại an toàn.
 *
 * Usage — trên prod chạy tsx trực tiếp trong container (KHÔNG `yarn`, xem ghi
 * chú prod-maintenance-script-env-trap):
 *   tsx src/scripts/count-source-pages.ts                # DRY RUN (mặc định)
 *   tsx src/scripts/count-source-pages.ts --apply        # ghi thật
 *   tsx src/scripts/count-source-pages.ts --limit 20     # thử trước vài job
 *   tsx src/scripts/count-source-pages.ts --job <id>     # chỉ một job
 */
import { countPdfPages } from "@vx/server-core/pdf-renderer";
import { MIN_SOURCE_PAGES } from "@vx/clone-core";
import { db } from "../db";
import { planPageCount } from "./count-source-pages-plan";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argVal = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY_JOB = argVal("--job");
const LIMIT = argVal("--limit") ? Number(argVal("--limit")) : Infinity;

function log(msg: string) {
  console.log(`[count-source-pages]${APPLY ? "" : " [dry-run]"} ${msg}`);
}

/** URL trong CSV có dấu cách / ký tự unicode — encode phần path trước khi fetch. */
function encodeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.split("/").map(encodeURIComponent).join("/");
    return u.toString();
  } catch {
    return raw;
  }
}

async function fetchPdf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(encodeUrl(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

async function main() {
  const jobs = await db.cloneJob.findMany({
    where: ONLY_JOB ? { id: ONLY_JOB } : { status: "pending", totalPages: 0 },
    select: { id: true, name: true, sourcePdfUrl: true, totalPages: true },
    orderBy: { createdAt: "asc" },
  });
  log(`${jobs.length} job cần đếm trang (ngưỡng ${MIN_SOURCE_PAGES})`);

  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let processed = 0;
  const started = Date.now();

  for (const job of jobs) {
    if (processed >= LIMIT) break;
    processed++;

    if (job.totalPages > 0) {
      bump("skip:already-counted");
      continue;
    }
    if (!job.sourcePdfUrl) {
      bump("skip:no-pdf-url");
      continue;
    }

    let pages: number;
    try {
      pages = await countPdfPages(await fetchPdf(job.sourcePdfUrl));
    } catch (err) {
      bump("error:read-pdf");
      log(`  LỖI ${job.id} "${job.name}": ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const plan = planPageCount(pages);
    if (!plan) {
      bump("skip:bad-page-count");
      continue;
    }

    const kind = plan.status ? "insufficient" : "ok";
    if (!APPLY) {
      bump(`would-${kind}`);
      if ((counts[`would-${kind}`] ?? 0) <= 5) log(`  ${job.id} "${job.name}" → ${plan.totalPages} trang (${kind})`);
      continue;
    }

    try {
      await db.cloneJob.update({
        where: { id: job.id },
        data: { totalPages: plan.totalPages, ...(plan.status ? { status: plan.status } : {}) },
      });
      bump(`updated-${kind}`);
    } catch (err) {
      bump("error:write");
      log(`  LỖI ghi ${job.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (processed % 100 === 0) {
      const perJob = (Date.now() - started) / processed / 1000;
      log(`  …${processed}/${Math.min(jobs.length, LIMIT)} job, ~${perJob.toFixed(1)}s/job`);
    }
  }

  log(`kết quả: ${JSON.stringify(counts)} — ${Math.round((Date.now() - started) / 1000)}s`);
  if (!APPLY) log("Dry run — chưa ghi gì. Thêm --apply để ghi thật.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
