import { describe, it, expect, vi } from "vitest";
import { stepReproduce } from "./reproduce";

function fakeCtx(jobId: string) {
  return {
    jobId,
    isDone: vi.fn().mockReturnValue(false),
    markStepComplete: vi.fn().mockResolvedValue(undefined),
  } as never;
}

function fakeDb(job: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    db: {
      cloneJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          updates.push(arg.data as Record<string, unknown>);
        }),
      },
    } as never,
  };
}

const deps = () => ({
  generatePage: vi.fn().mockResolvedValue({ base64: "" }),
  uploadToR2: vi.fn().mockResolvedValue({ url: "https://r2/out.png" }),
  resolveR2Url: vi.fn().mockImplementation((k: string) => `https://r2${k}`),
});

describe("stepReproduce", () => {
  it("generates an image for every page that was not dropped at the gate", async () => {
    const { db } = fakeDb({
      id: "j1",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "analyzed" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "analyzed" },
      ],
    });
    const d = deps();
    await stepReproduce(fakeCtx("j1"), db, d);
    expect(d.generatePage).toHaveBeenCalledTimes(2);
  });

  // Regression: the legacy multi-step path paid for an image generation on
  // every page in job.pages, dropped ones included, and stepCreateBook then
  // filtered them straight back out.
  it("skips a page the operator dropped from the clone", async () => {
    const { db } = fakeDb({
      id: "j2",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "analyzed" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "analyzed", excludedFromClone: true },
        { pageNumber: 3, imageUrl: "/p3.png", status: "analyzed", excluded: true },
        { pageNumber: 4, imageUrl: "/p4.png", status: "analyzed" },
      ],
    });
    const d = deps();
    await stepReproduce(fakeCtx("j2"), db, d);
    expect(d.generatePage).toHaveBeenCalledTimes(2);
    expect(d.generatePage.mock.calls.map((c) => (c[0] as { pageNumber: number }).pageNumber)).toEqual(
      [1, 4],
    );
  });

  it("leaves the dropped page without a redesignedUrl", async () => {
    const { db, updates } = fakeDb({
      id: "j3",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "analyzed" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "analyzed", excludedFromClone: true },
      ],
    });
    await stepReproduce(fakeCtx("j3"), db, deps());
    const last = updates.at(-1) as { pages: Array<Record<string, unknown>> };
    const dropped = last.pages.find((p) => p.pageNumber === 2)!;
    expect(dropped.redesignedUrl).toBeUndefined();
  });
});
