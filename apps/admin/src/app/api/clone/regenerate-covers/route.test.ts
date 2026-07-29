import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the reuse path so NO real AI / server-core runs when the route imports.
vi.mock("@vx/clone-core/job-context", () => ({
  JobContext: {
    load: vi.fn().mockResolvedValue({ jobId: "ctx" }),
  },
}));
vi.mock("@vx/clone-core/steps", () => ({
  stepGenerateCover: vi.fn().mockResolvedValue(undefined),
}));
// Shared deps module — stubbed so importing the route doesn't pull real
// @vx/server-core (R2 client init, LLM provider, etc.).
vi.mock("@vx/server-core/cover-generation/clone-cover-deps", () => ({
  generateCoverDeps: {},
}));
vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { prisma } from "@vx/db";
import { JobContext } from "@vx/clone-core/job-context";
import { stepGenerateCover } from "@vx/clone-core/steps";

const count = prisma.cloneJob.count as ReturnType<typeof vi.fn>;
const findMany = prisma.cloneJob.findMany as ReturnType<typeof vi.fn>;
const load = JobContext.load as ReturnType<typeof vi.fn>;
const stepCover = stepGenerateCover as ReturnType<typeof vi.fn>;

function makeReq(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/clone/regenerate-covers", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function job(id: string) {
  return { id, resultBookId: `book-${id}`, name: `Job ${id}` };
}

describe("POST /api/clone/regenerate-covers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    load.mockResolvedValue({ jobId: "ctx" });
    stepCover.mockResolvedValue(undefined);
  });

  it("defaults to dryRun=true (empty body) and does NOT call stepGenerateCover", async () => {
    count.mockResolvedValue(2);
    findMany.mockResolvedValue([job("a"), job("b")]);

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.total).toBe(2);
    expect(body.count).toBe(2);
    expect(body.jobs).toEqual([
      { jobId: "a", bookId: "book-a", name: "Job a" },
      { jobId: "b", bookId: "book-b", name: "Job b" },
    ]);
    expect(stepCover).not.toHaveBeenCalled();
  });

  it("dryRun=false calls stepGenerateCover once per returned job with correct ok count", async () => {
    count.mockResolvedValue(2);
    findMany.mockResolvedValue([job("a"), job("b")]);

    const res = await POST(makeReq({ dryRun: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(false);
    expect(stepCover).toHaveBeenCalledTimes(2);
    expect(body.processed).toBe(2);
    expect(body.ok).toBe(2);
    expect(body.failed).toBe(0);
  });

  it("continues the batch when one job's stepGenerateCover rejects", async () => {
    count.mockResolvedValue(3);
    findMany.mockResolvedValue([job("a"), job("b"), job("c")]);
    // Fail the middle one; the loop must still process a and c.
    stepCover
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("cover boom"))
      .mockResolvedValueOnce(undefined);

    const res = await POST(makeReq({ dryRun: false }));
    const body = await res.json();

    expect(stepCover).toHaveBeenCalledTimes(3);
    expect(body.processed).toBe(3);
    expect(body.ok).toBe(2);
    expect(body.failed).toBe(1);
    const failed = body.results.find(
      (r: { status: string }) => r.status === "error",
    );
    expect(failed).toMatchObject({ jobId: "b", status: "error", error: "cover boom" });
  });

  it("passes jobIds into the where clause of count and findMany", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await POST(makeReq({ jobIds: ["x", "y"] }));

    const expectedWhere = {
      resultBookId: { not: null },
      id: { in: ["x", "y"] },
    };
    expect(count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
  });

  it("clamps limit above 50 down to 50 in take", async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await POST(makeReq({ limit: 999 }));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
