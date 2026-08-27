/**
 * READ-ONLY dry run of the classify gate.
 *
 * For every job sitting at the gate it prints what JobClassifyTab's banner
 * TELLS the operator versus what decideGateOutcome() would ACTUALLY do, and
 * which steps would then run. Never writes; never enqueues.
 *
 *   node --env-file=apps/admin/.env.local scripts/gate-dry-run.mjs
 *
 * The banner model below mirrors describeGateState() in
 * packages/coloring/src/data/use-classify-gate.ts. Keep the two in step: the
 * whole point of this script is to catch the UI and the worker telling
 * different stories, which is exactly the bug it was written to find.
 */
import { PrismaClient } from "@prisma/client";

const ORDER = ["download","render","trim-pdf","analyze","extract-entities","reproduce","fill-interior","create-book","generate-cover"];
const isDone = (cur, step) => (cur ? ORDER.indexOf(step) <= ORDER.indexOf(cur) : false);
const GATE_MIN_INTERIOR = 40;
const FILL_TARGET = 40;

const dropped = (p) => p.excludedFromClone ?? p.excluded ?? false;
const isInterior = (p) => (p.pageType ?? (p.pageNumber === 1 ? "cover" : "interior")) === "interior";

const db = new PrismaClient();
const rows = await db.cloneJob.findMany({
  where: { status: { in: ["awaiting-classify", "awaiting-fill"] } },
  select: { id: true, name: true, status: true, data: true, pages: true },
  orderBy: { updatedAt: "desc" },
});

let lies = 0;
for (const j of rows) {
  const cur = j.data?.currentStep;
  const spent = isDone(cur, "reproduce");
  const pages = Array.isArray(j.pages) ? j.pages : [];
  const interior = pages.filter((p) => isInterior(p) && !dropped(p)).length;
  const lane2 = interior < GATE_MIN_INTERIOR;

  // What the UI banner says — mirrors describeGateState(status, interior, kept, spent).
  const willPark = lane2 && !spent;
  const banner = willPark
    ? `PARK — "KHÔNG gọi Diaflow và không tốn chi phí"`
    : lane2
      ? `PROCEED — "đã chạy Diaflow rồi nên KHÔNG được đưa vào hàng chờ … có phát sinh chi phí"`
      : `SPEND — "sẽ gửi ${pages.filter((p) => !dropped(p)).length} trang cho Diaflow"`;

  // What decideGateOutcome() actually returns.
  const outcome = !lane2 ? "proceed(lane 1)" : spent ? "proceed(lane 2)" : "await-fill(park)";

  // Which paid steps the processor would then reach.
  const willRun = [];
  if (outcome !== "await-fill(park)") {
    if (!isDone(cur, "reproduce")) willRun.push("one-shot Diaflow");
    if (!isDone(cur, "fill-interior")) {
      const clones = Math.max(0, FILL_TARGET - interior);
      if (clones > 0) willRun.push(`fill-interior (${clones} ảnh clone)`);
    }
    if (!isDone(cur, "generate-cover")) willRun.push("generate-cover (1 ảnh)");
  }

  // A mismatch now means the banner and decideGateOutcome() disagree about
  // whether confirming parks the job — i.e. the two have drifted apart again.
  const mismatch = willPark !== (outcome === "await-fill(park)");
  if (mismatch) lies++;
  console.log(
    `\n${mismatch ? "❌" : "  "} ${j.id.slice(0, 8)}  ${String(pages.length).padStart(3)}p  interior=${String(interior).padStart(3)}  currentStep=${String(cur).padEnd(15)} alreadySpent=${spent}` +
      `\n     banner : ${banner}` +
      `\n     thực tế: ${outcome}` +
      `\n     sẽ chạy: ${willRun.length ? willRun.join(" + ") : "(không gì tốn tiền)"}`,
  );
}
console.log(`\n${"=".repeat(70)}\nrow mà banner nói sai: ${lies} / ${rows.length}`);
await db.$disconnect();
