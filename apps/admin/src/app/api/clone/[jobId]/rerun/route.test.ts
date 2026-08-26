// apps/admin/src/app/api/clone/[jobId]/rerun/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
const sourceBookFindUnique = vi.fn();
const sourceBookUpdate = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    sourceBook: {
      findUnique: (...a: unknown[]) => sourceBookFindUnique(...a),
      update: (...a: unknown[]) => sourceBookUpdate(...a),
    },
  },
}));

const enqueueCloneJob = vi.fn();
vi.mock("@vx/clone-core/queue-enqueue", () => ({
  enqueueCloneJob: (...a: unknown[]) => enqueueCloneJob(...a),
}));

vi.mock("@/lib/queue/clone-queue", () => ({ cloneQueue: {} }));

import { POST } from "./route";

function post(jobId: string) {
  return POST(
    new NextRequest(`http://localhost/api/clone/${jobId}/rerun`, { method: "POST" }),
    { params: Promise.resolve({ jobId }) },
  );
}

describe("POST /api/clone/[jobId]/rerun", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    sourceBookFindUnique.mockReset();
    sourceBookUpdate.mockReset();
    enqueueCloneJob.mockReset();
    enqueueCloneJob.mockResolvedValue({ enqueued: true });
    update.mockResolvedValue({});
    sourceBookFindUnique.mockResolvedValue(null);
  });

  it("drops classifyConfirmed, interiorCount, and lane from job.data so a rerun cannot bypass the pre-spend gate", async () => {
    findUnique.mockResolvedValue({
      id: "job-1",
      status: "reproduced",
      resultBookId: "book-1",
      data: {
        classifyConfirmed: true,
        interiorCount: 44,
        lane: 1,
        sourceBookId: "sb-1",
      },
    });

    const res = await post("job-1");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);

    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "job-1" });

    // The bug this guards: a stale classifyConfirmed (plus the routing data
    // it was computed alongside) surviving a rerun would let the re-rendered,
    // unclassified pages sail through the pre-spend gate with no operator
    // review, straight to the paid provider call.
    expect(arg.data.data).not.toHaveProperty("classifyConfirmed");
    expect(arg.data.data).not.toHaveProperty("interiorCount");
    expect(arg.data.data).not.toHaveProperty("lane");

    // Unrelated data must survive the reset.
    expect(arg.data.data.sourceBookId).toBe("sb-1");
  });
});
