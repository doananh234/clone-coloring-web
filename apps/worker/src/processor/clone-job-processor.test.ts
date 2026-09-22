import { describe, it, expect, vi, beforeEach } from "vitest";

const steps = vi.hoisted(() => ({
  stepDownload: vi.fn(),
  stepRender: vi.fn(),
  stepAnalyze: vi.fn(),
  stepExtractEntities: vi.fn(),
  stepReproduce: vi.fn(),
  stepOneShot: vi.fn(),
  stepFillInterior: vi.fn(),
  stepCreateBook: vi.fn(async () => "book-1"),
  stepGenerateCover: vi.fn(),
  stepGenerateBookMeta: vi.fn(),
  stepFinalizeCover: vi.fn(),
}));
const ctx = vi.hoisted(() => ({
  // Everything up to fill-interior already ran; create-book and later are pending.
  isDone: vi.fn((step: string) =>
    ["download", "render", "analyze", "extract-entities", "reproduce", "fill-interior"].includes(step),
  ),
  resultBookId: undefined as string | undefined,
  markComplete: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("@vx/clone-core", () => ({
  ...steps,
  JobContext: { load: vi.fn(async () => ctx) },
  withRetry: (_step: string, fn: () => unknown) => fn(),
}));
vi.mock("./step-deps", () => ({
  downloadDeps: {}, renderDeps: {}, analyzeDeps: {}, extractEntitiesDeps: {},
  reproduceDeps: {}, createBookDeps: {}, oneShotDeps: {}, fillInteriorDeps: {},
}));
vi.mock("../notify/telegram", () => ({ notifySuccess: vi.fn(), notifyFailure: vi.fn() }));
vi.mock("../db", () => ({
  db: {
    cloneJob: {
      findUnique: vi.fn(async () => ({ status: "pending", data: { classifyConfirmed: true } })),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { processCloneJob } from "./clone-job-processor";

describe("processCloneJob — no automatic cover", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes right after create-book, without the AI cover / meta steps", async () => {
    await processCloneJob("j1");

    expect(steps.stepCreateBook).toHaveBeenCalledTimes(1);
    expect(steps.stepGenerateCover).not.toHaveBeenCalled();
    expect(steps.stepGenerateBookMeta).not.toHaveBeenCalled();
    expect(steps.stepFinalizeCover).not.toHaveBeenCalled();
    expect(ctx.markComplete).toHaveBeenCalledWith("book-1");
  });
});
