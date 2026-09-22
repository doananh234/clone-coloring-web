import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const count = vi.fn();
const readCounts = vi.fn();
const queryRaw = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
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
    queryRaw.mockReset().mockResolvedValue([]);
  });

  it("searches by q across name, id and the source-matched ids", async () => {
    queryRaw.mockResolvedValue([{ id: "s1" }]);
    const res = await GET(req("q=plat&counts=0"));

    expect(queryRaw).toHaveBeenCalledTimes(1);
    // Tagged template: the escaped ILIKE pattern is the bound value.
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(["%plat%"]);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { name: { contains: "plat", mode: "insensitive" } },
            { id: { contains: "plat", mode: "insensitive" } },
            { id: { in: ["s1"] } },
          ],
        },
      ],
    });
    expect(count.mock.calls[0][0].where).toEqual(where);
    expect((await res.json()).total).toBe(7);
  });

  it("escapes LIKE wildcards in q", async () => {
    await GET(req(`q=${encodeURIComponent("50%_off")}&counts=0`));
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(["%50\\%\\_off%"]);
  });

  it("skips the source lookup when q is blank", async () => {
    await GET(req("q=%20%20&counts=0"));
    expect(queryRaw).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("filters by exact source and counts the total", async () => {
    const res = await GET(req(`source=${encodeURIComponent("Búsqueda y Plática")}&counts=0`));
    expect(findMany.mock.calls[0][0].where).toEqual({
      AND: [{ data: { path: ["brand"], equals: "Búsqueda y Plática" } }],
    });
    expect((await res.json()).total).toBe(7);
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
