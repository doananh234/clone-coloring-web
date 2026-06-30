import { describe, it, expect } from "vitest";
import { JobContext } from "./job-context";
import type { CloneStep } from "./types";

function makeDb(initial: Record<string, unknown> = {}) {
  const docs = new Map<string, Record<string, unknown>>([["cloneJobs/job1", { id: "job1", ...initial }]]);
  const docRef = (path: string) => ({
    get: async () => ({
      exists: docs.has(path),
      data: () => docs.get(path),
    }),
    update: async (patch: Record<string, unknown>) => {
      docs.set(path, { ...(docs.get(path) ?? {}), ...patch });
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(path, opts?.merge ? { ...(docs.get(path) ?? {}), ...data } : data);
    },
  });
  return {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
    }),
    _docs: docs,
  };
}

describe("JobContext", () => {
  it("loads an existing job and computes isDone correctly", async () => {
    const db = makeDb({ sourceBookId: "src1", currentStep: "render" }) as never;
    const ctx = await JobContext.load(db, "job1");
    expect(ctx.jobId).toBe("job1");
    expect(ctx.sourceBookId).toBe("src1");
    expect(ctx.isDone("download")).toBe(true);
    expect(ctx.isDone("render")).toBe(true);
    expect(ctx.isDone("analyze")).toBe(false);
  });

  it("isDone returns false when no currentStep", async () => {
    const db = makeDb({}) as never;
    const ctx = await JobContext.load(db, "job1");
    expect(ctx.isDone("download")).toBe(false);
  });

  it("throws when job missing", async () => {
    const db = {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }),
    } as never;
    await expect(JobContext.load(db, "missing")).rejects.toThrow(/missing/);
  });

  it("recordRetry appends a record", async () => {
    const db = makeDb({}) as never;
    const ctx = await JobContext.load(db, "job1");
    await ctx.recordRetry("analyze", 1, new Error("boom"));
    const saved = db._docs.get("cloneJobs/job1") as { retryHistory: Array<{ step: string; attempt: number; error: string }> };
    expect(saved.retryHistory).toHaveLength(1);
    expect(saved.retryHistory[0].step).toBe("analyze");
    expect(saved.retryHistory[0].attempt).toBe(1);
    expect(saved.retryHistory[0].error).toBe("boom");
  });

  it("markStepComplete advances currentStep", async () => {
    const db = makeDb({}) as never;
    const ctx = await JobContext.load(db, "job1");
    await ctx.markStepComplete("download");
    const saved = db._docs.get("cloneJobs/job1") as { currentStep: CloneStep };
    expect(saved.currentStep).toBe("download");
    expect(ctx.isDone("download")).toBe(true);
  });

  it("markComplete sets status, finishedAt, resultBookId", async () => {
    const db = makeDb({}) as never;
    const ctx = await JobContext.load(db, "job1");
    await ctx.markComplete("book-42");
    const saved = db._docs.get("cloneJobs/job1") as { status: string; resultBookId: string; finishedAt: string };
    expect(saved.status).toBe("reproduced");
    expect(saved.resultBookId).toBe("book-42");
    expect(typeof saved.finishedAt).toBe("string");
  });

  it("markFailed sets status=error and failedStep from currentStep", async () => {
    const db = makeDb({ currentStep: "analyze" }) as never;
    const ctx = await JobContext.load(db, "job1");
    await ctx.markFailed(new Error("boom"));
    const saved = db._docs.get("cloneJobs/job1") as { status: string; failedStep: string; error: string };
    expect(saved.status).toBe("error");
    expect(saved.failedStep).toBe("analyze");
    expect(saved.error).toContain("boom");
  });
});
