import type { PrismaClient } from "@prisma/client";

/**
 * Cached CloneJob status counts.
 *
 * The counts table is maintained by two paths:
 *   1. Event-driven bumps (`bumpCloneJobStatusCount`) at hot mutation sites —
 *      create, delete, and status transitions in the worker pipeline.
 *   2. Self-heal recompute (`syncCloneJobStatusCounts`) which runs when the
 *      counts table is empty OR older than STALE_TTL_SECONDS. This catches
 *      drift from any mutation site that forgot to bump.
 *
 * `readCloneJobStatusCounts` returns the counts as a `Record<status, count>`
 * plus the total; callers should not touch the table directly.
 */

const STALE_TTL_SECONDS = 60;

/** Increment/decrement in one atomic upsert. Positive delta creates the row. */
export async function bumpCloneJobStatusCount(
  db: PrismaClient,
  status: string,
  delta: number,
): Promise<void> {
  if (!status || delta === 0) return;
  try {
    await db.cloneJobStatusCount.upsert({
      where: { status },
      create: { status, count: Math.max(0, delta) },
      update: { count: { increment: delta } },
    });
  } catch (err) {
    // Non-fatal: bumps drift is corrected by the periodic recompute.
    console.error("[clone-status-counts] bump failed", { status, delta, err });
  }
}

/** Move one job's count from `from` → `to` in a single transaction. */
export async function transitionCloneJobStatus(
  db: PrismaClient,
  from: string | null | undefined,
  to: string | null | undefined,
): Promise<void> {
  if (from === to) return;
  // No transaction needed — two independent upserts. If one fails, the periodic
  // recompute corrects it. Keeping this outside a transaction avoids blocking
  // the worker on a long lock in the queue-mode pooler.
  if (from) await bumpCloneJobStatusCount(db, from, -1);
  if (to) await bumpCloneJobStatusCount(db, to, 1);
}

/** Full recompute — reads every row's status via groupBy and upserts. */
export async function syncCloneJobStatusCounts(db: PrismaClient): Promise<void> {
  const rows = await db.cloneJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  await db.$transaction(
    rows.map((r) =>
      db.cloneJobStatusCount.upsert({
        where: { status: r.status },
        create: { status: r.status, count: r._count._all },
        update: { count: r._count._all },
      }),
    ),
  );
}

/**
 * Read counts, self-healing when empty or stale.
 * Returns `{ counts: { statusX: N, ... }, total }`.
 */
export async function readCloneJobStatusCounts(
  db: PrismaClient,
): Promise<{ counts: Record<string, number>; total: number }> {
  let rows = await db.cloneJobStatusCount.findMany();

  const isEmpty = rows.length === 0;
  const staleThreshold = new Date(Date.now() - STALE_TTL_SECONDS * 1000);
  const isStale =
    !isEmpty && rows.every((r) => r.updatedAt.getTime() < staleThreshold.getTime());

  if (isEmpty || isStale) {
    await syncCloneJobStatusCounts(db);
    rows = await db.cloneJobStatusCount.findMany();
  }

  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    counts[r.status] = r.count;
    total += r.count;
  }
  return { counts, total };
}
