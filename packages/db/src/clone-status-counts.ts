import type { PrismaClient } from "@prisma/client";

/**
 * Cached CloneJob status counts.
 *
 * The jobs dashboard shows per-status badge counts across ALL rows. Computing
 * them with a live `groupBy` on every request is a full-table aggregate. Instead
 * we keep a tiny `CloneJobStatusCount` table and recompute it lazily:
 *
 *   `readCloneJobStatusCounts` returns the cached counts, and self-heals with a
 *   full recompute (`syncCloneJobStatusCounts`) when the cache is empty OR older
 *   than STALE_TTL_SECONDS. So the expensive `groupBy` runs at most once per TTL
 *   (server-wide, lazily), not once per request — and the badges lag by ≤ TTL.
 *
 * NOTE: this is deliberately recompute-only (no per-mutation bumps). Event-driven
 * bumps were removed because they broke the staleness check: a recent bump made
 * `every(row stale)` false, so the cache never recomputed and drifted. If sub-TTL
 * freshness is ever needed, add bumps AND track "last full recompute" in a
 * dedicated marker row (not per-status updatedAt) so staleness stays correct.
 */

const STALE_TTL_SECONDS = 60;

/**
 * Full recompute — reads every row's status via groupBy and upserts the counts.
 * Statuses that no longer have any jobs are zeroed (not left at their stale
 * count), so an emptied status never lingers in the badges.
 */
export async function syncCloneJobStatusCounts(db: PrismaClient): Promise<void> {
  const [grouped, existing] = await Promise.all([
    db.cloneJob.groupBy({ by: ["status"], _count: { _all: true } }),
    db.cloneJobStatusCount.findMany({ select: { status: true } }),
  ]);

  const nextByStatus = new Map(grouped.map((r) => [r.status, r._count._all]));

  const ops: Promise<unknown>[] = [];
  for (const [status, count] of nextByStatus) {
    ops.push(
      db.cloneJobStatusCount.upsert({
        where: { status },
        create: { status, count },
        update: { count },
      }),
    );
  }
  // Zero out cached statuses that the recompute no longer sees any jobs for.
  for (const e of existing) {
    if (!nextByStatus.has(e.status)) {
      ops.push(
        db.cloneJobStatusCount.update({ where: { status: e.status }, data: { count: 0 } }),
      );
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous upsert/update ops
  await db.$transaction(ops as any);
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
  // After a recompute every row shares the same updatedAt, so "all rows older
  // than the threshold" == "the cache as a whole is older than TTL".
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
