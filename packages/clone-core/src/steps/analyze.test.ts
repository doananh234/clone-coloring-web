import { describe, it, expect, vi } from "vitest";
import { stepAnalyze } from "./analyze";

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
  analyzePage: vi.fn().mockResolvedValue({ reproductionPrompt: "p" }),
  resolveR2Url: vi.fn().mockImplementation((k: string) => `https://r2${k}`),
});

describe("stepAnalyze", () => {
  it("analyzes every page that was not dropped at the gate", async () => {
    const { db } = fakeDb({
      id: "j1",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "rendered" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "rendered" },
      ],
    });
    const d = deps();
    await stepAnalyze(fakeCtx("j1"), db, d);
    expect(d.analyzePage).toHaveBeenCalledTimes(2);
  });

  // Regression: the legacy multi-step path iterated every page in job.pages, so
  // a page the operator dropped still cost a vision-analyze call — and
  // stepCreateBook then threw the result away.
  it("skips a page the operator dropped from the clone", async () => {
    const { db } = fakeDb({
      id: "j2",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "rendered" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "rendered", excludedFromClone: true },
        { pageNumber: 3, imageUrl: "/p3.png", status: "rendered", excluded: true },
        { pageNumber: 4, imageUrl: "/p4.png", status: "rendered" },
      ],
    });
    const d = deps();
    await stepAnalyze(fakeCtx("j2"), db, d);
    expect(d.analyzePage).toHaveBeenCalledTimes(2);
    expect(d.resolveR2Url.mock.calls.map((c) => c[0])).toEqual(["/p1.png", "/p4.png"]);
  });

  it("leaves the dropped page untouched in job.pages", async () => {
    const { db, updates } = fakeDb({
      id: "j3",
      pages: [
        { pageNumber: 1, imageUrl: "/p1.png", status: "rendered" },
        { pageNumber: 2, imageUrl: "/p2.png", status: "rendered", excludedFromClone: true },
      ],
    });
    await stepAnalyze(fakeCtx("j3"), db, deps());
    const last = updates.at(-1) as { pages: Array<Record<string, unknown>> };
    const dropped = last.pages.find((p) => p.pageNumber === 2)!;
    expect(dropped.status).toBe("rendered");
    expect(dropped.rawData).toBeUndefined();
  });
});
