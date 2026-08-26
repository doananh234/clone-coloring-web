import { describe, it, expect, vi } from "vitest";
import { stepTrimPdf } from "./trim-pdf";

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
        updateMany: vi.fn().mockImplementation(async (arg: { data: unknown }) => {
          updates.push(arg.data as Record<string, unknown>);
        }),
      },
    } as never,
  };
}

const fakeDeps = () => ({
  readPdfFromR2: vi.fn().mockResolvedValue(Buffer.from("pdf-bytes")),
  copyPdfPages: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  uploadToR2: vi.fn().mockResolvedValue({ url: "/assets/clone-jobs/job-1/source-trimmed.pdf" }),
});

const pages = [
  { pageNumber: 1, pageType: "cover" },
  { pageNumber: 2, pageType: "interior" },
  { pageNumber: 3, pageType: "interior", excludedFromClone: true },
  { pageNumber: 4, pageType: "interior" },
];

describe("stepTrimPdf", () => {
  it("copies only kept pages, converting 1-based page numbers to 0-based indices", async () => {
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: "/assets/clone-jobs/job-1/source.pdf", pages, data: {} });
    const deps = fakeDeps();
    await stepTrimPdf(fakeCtx("job-1"), db, deps);
    expect(deps.copyPdfPages).toHaveBeenCalledWith(expect.anything(), [0, 1, 3]);
  });

  it("persists the trimmed url and the kept-page map", async () => {
    const { db, updates } = fakeDb({ id: "job-1", sourcePdfUrl: "/assets/clone-jobs/job-1/source.pdf", pages, data: { brand: "X" } });
    await stepTrimPdf(fakeCtx("job-1"), db, fakeDeps());
    const data = updates[0].data as Record<string, unknown>;
    expect(data.trimmedPdfUrl).toBe("/assets/clone-jobs/job-1/source-trimmed.pdf");
    expect(data.keptPageNumbers).toEqual([1, 2, 4]);
    expect(data.brand).toBe("X"); // preserves unrelated keys
  });

  it("skips the copy entirely when nothing was dropped", async () => {
    const allKept = [
      { pageNumber: 1, pageType: "interior" },
      { pageNumber: 2, pageType: "interior" },
    ];
    const { db, updates } = fakeDb({ id: "job-1", sourcePdfUrl: "/s.pdf", pages: allKept, data: {} });
    const deps = fakeDeps();
    await stepTrimPdf(fakeCtx("job-1"), db, deps);
    expect(deps.copyPdfPages).not.toHaveBeenCalled();
    expect(deps.uploadToR2).not.toHaveBeenCalled();
    const data = updates[0].data as Record<string, unknown>;
    expect(data.trimmedPdfUrl).toBe("/s.pdf");
    expect(data.keptPageNumbers).toEqual([1, 2]);
  });

  it("throws when the job has no sourcePdfUrl", async () => {
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: null, pages, data: {} });
    await expect(stepTrimPdf(fakeCtx("job-1"), db, fakeDeps())).rejects.toThrow(/sourcePdfUrl/);
  });

  it("marks the step complete", async () => {
    const ctx = fakeCtx("job-1");
    const { db } = fakeDb({ id: "job-1", sourcePdfUrl: "/s.pdf", pages, data: {} });
    await stepTrimPdf(ctx, db, fakeDeps());
    expect((ctx as unknown as { markStepComplete: ReturnType<typeof vi.fn> }).markStepComplete)
      .toHaveBeenCalledWith("trim-pdf");
  });
});
