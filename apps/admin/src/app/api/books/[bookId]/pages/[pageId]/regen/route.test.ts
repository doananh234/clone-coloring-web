// apps/admin/src/app/api/books/[bookId]/pages/[pageId]/regen/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const create = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    book: { findUnique: (...a: unknown[]) => findUnique(...a) },
    generationJob: { create: (...a: unknown[]) => create(...a) },
  },
}));

const enqueueGenerationJob = vi.fn();
vi.mock("@/lib/queue/generation-queue", () => ({
  enqueueGenerationJob: (...a: unknown[]) => enqueueGenerationJob(...a),
}));
vi.mock("@/lib/queue/queue-timeout", () => ({
  withQueueTimeout: (p: Promise<unknown>) => p,
  isQueueTimeout: () => false,
  queueUnavailableResponse: () => new Response("queue down", { status: 503 }),
}));

import { POST } from "./route";

const book = {
  title: "Cozy Japan",
  coloringPages: [{ id: "interior-1", url: "/i1.png" }],
  summaryPages: [{ id: "intro-1", url: "/s1.png" }],
};

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/books/b1/pages/p/regen", {
    method: "POST",
    body: JSON.stringify(body),
  });
const params = (pageId: string) => ({ params: Promise.resolve({ bookId: "b1", pageId }) });

const payloadOf = () => create.mock.calls[0][0].data.payload;

describe("POST /api/books/[bookId]/pages/[pageId]/regen", () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
    enqueueGenerationJob.mockReset();
    findUnique.mockResolvedValue(book);
    create.mockResolvedValue({ id: "job1" });
    enqueueGenerationJob.mockResolvedValue(undefined);
  });

  it("finds an intro page in summaryPages when target is summary", async () => {
    const res = await POST(req({ target: "summary" }), params("intro-1"));

    expect(res.status).toBe(200);
    expect(payloadOf()).toMatchObject({ pageId: "intro-1", target: "summary" });
  });

  it("404s for an intro page without the summary target (it is not an interior)", async () => {
    const res = await POST(req({}), params("intro-1"));

    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("still resolves interiors from coloringPages by default", async () => {
    const res = await POST(req({}), params("interior-1"));

    expect(res.status).toBe(200);
    expect(payloadOf().target).toBeUndefined();
  });

  it("passes promptOverride through to the job payload", async () => {
    await POST(req({ target: "summary", promptOverride: "Redraw it snowy." }), params("intro-1"));

    expect(payloadOf().promptOverride).toBe("Redraw it snowy.");
  });

  it("drops a blank promptOverride so the worker builds the default prompt", async () => {
    await POST(req({ target: "summary", promptOverride: "   " }), params("intro-1"));

    expect(payloadOf().promptOverride).toBeUndefined();
  });
});
