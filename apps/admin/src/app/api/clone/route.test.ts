import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const count = vi.fn();
const readCounts = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
  readCloneJobStatusCounts: (...a: unknown[]) => readCounts(...a),
}));
vi.mock("@vx/server-core/r2", () => ({
  getR2Config: vi.fn(),
  createR2Client: vi.fn(),
  uploadToR2: vi.fn(),
  resolveR2Url: vi.fn(),
}));
vi.mock("@vx/server-core/pdf-renderer", () => ({ renderPdfToImages: vi.fn() }));
vi.mock("@/lib/queue/clone-queue", () => ({ cloneQueue: { add: vi.fn() } }));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/clone?${qs}`);

describe("GET /api/clone", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(7);
    readCounts.mockReset().mockResolvedValue({ total: 0, counts: {} });
  });

  it("passes the SAME where to findMany and count when filtering", async () => {
    await GET(req("niche=Cozy&status=pending&counts=0"));

    expect(count).toHaveBeenCalledTimes(1);
    const listWhere = findMany.mock.calls[0][0].where;
    const countWhere = count.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
    expect(listWhere).toEqual({
      AND: [{ status: "pending" }, { sourceBook: { is: { niche: "Cozy" } } }],
    });
  });

  it("returns that filtered total in the response", async () => {
    const res = await GET(req("niche=Cozy&counts=0"));
    expect((await res.json()).total).toBe(7);
  });

  it("skips the count entirely when no tag filter is applied", async () => {
    const res = await GET(req("status=pending&counts=0"));
    expect(count).not.toHaveBeenCalled();
    expect((await res.json()).total).toBeNull();
  });

  it("lifts niche and priority from the joined source book", async () => {
    findMany.mockResolvedValue([
      {
        id: "j1", name: "n", status: "pending", totalPages: 0, analyzedPages: 0,
        bookId: null, error: null, data: {}, createdAt: new Date(), updatedAt: new Date(),
        sourceBook: { niche: "Film", priority: "2" },
      },
    ]);

    const res = await GET(req("counts=0"));
    const job = (await res.json()).data[0];
    expect(job.niche).toBe("Film");
    expect(job.priority).toBe("2");
  });

  it("reports null tags for a job with no source book", async () => {
    findMany.mockResolvedValue([
      {
        id: "j2", name: "n", status: "pending", totalPages: 0, analyzedPages: 0,
        bookId: null, error: null, data: {}, createdAt: new Date(), updatedAt: new Date(),
        sourceBook: null,
      },
    ]);

    const res = await GET(req("counts=0"));
    const job = (await res.json()).data[0];
    expect(job.niche).toBeNull();
    expect(job.priority).toBeNull();
  });
});
