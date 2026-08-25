import { describe, it, expect, vi } from "vitest";
import {
  readCloneJobStatusCounts,
  syncCloneJobStatusCounts,
} from "./clone-status-counts";

/**
 * Minimal PrismaClient stub backed by an in-memory store. Tracks the count rows
 * and lets each test drive what `cloneJob.groupBy` returns.
 */
function makeDb(opts: {
  groupBy: Array<{ status: string; count: number }>;
  cache?: Array<{ status: string; count: number; ageSeconds: number }>;
}) {
  const now = Date.now();
  const store = new Map<string, { count: number; updatedAt: Date }>();
  for (const c of opts.cache ?? []) {
    store.set(c.status, { count: c.count, updatedAt: new Date(now - c.ageSeconds * 1000) });
  }

  const groupBy = vi.fn(async () =>
    opts.groupBy.map((g) => ({ status: g.status, _count: { _all: g.count } })),
  );

  const db = {
    cloneJob: { groupBy },
    cloneJobStatusCount: {
      findMany: vi.fn(async () =>
        [...store.entries()].map(([status, v]) => ({
          status,
          count: v.count,
          updatedAt: v.updatedAt,
        })),
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        store.set(where.status, {
          count: store.has(where.status) ? update.count : create.count,
          updatedAt: new Date(),
        });
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const cur = store.get(where.status);
        store.set(where.status, { count: data.count, updatedAt: new Date() });
        return cur;
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, store, groupBy };
}

describe("syncCloneJobStatusCounts", () => {
  it("zeroes cached statuses that no longer have any jobs", async () => {
    const { db, store } = makeDb({
      groupBy: [{ status: "running", count: 2 }],
      cache: [
        { status: "running", count: 1, ageSeconds: 0 },
        { status: "queued", count: 5, ageSeconds: 0 }, // emptied out
      ],
    });
    await syncCloneJobStatusCounts(db);
    expect(store.get("running")?.count).toBe(2);
    expect(store.get("queued")?.count).toBe(0); // not left at its stale 5
  });
});

describe("readCloneJobStatusCounts", () => {
  it("recomputes when the cache is empty", async () => {
    const { db, groupBy } = makeDb({
      groupBy: [
        { status: "queued", count: 3 },
        { status: "error", count: 1 },
      ],
    });
    const res = await readCloneJobStatusCounts(db);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(4);
    expect(res.counts).toEqual({ queued: 3, error: 1 });
  });

  it("serves fresh cache without recomputing", async () => {
    const { db, groupBy } = makeDb({
      groupBy: [{ status: "queued", count: 99 }],
      cache: [{ status: "queued", count: 3, ageSeconds: 5 }], // fresh (< 60s)
    });
    const res = await readCloneJobStatusCounts(db);
    expect(groupBy).not.toHaveBeenCalled();
    expect(res.total).toBe(3);
  });

  it("recomputes when the cache is stale", async () => {
    const { db, groupBy } = makeDb({
      groupBy: [{ status: "queued", count: 7 }],
      cache: [{ status: "queued", count: 3, ageSeconds: 120 }], // stale (> 60s)
    });
    const res = await readCloneJobStatusCounts(db);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(res.total).toBe(7);
  });
});
