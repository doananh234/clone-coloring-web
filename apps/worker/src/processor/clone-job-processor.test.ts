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
  sourceBookId: undefined as string | undefined,
  markStepComplete: vi.fn(),
  markComplete: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("@vx/clone-core", () => ({
  ...steps,
  JobContext: { load: vi.fn(async () => ctx) },
  withRetry: (_step: string, fn: () => unknown) => fn(),
  MIN_SOURCE_PAGES: 42,
  INSUFFICIENT_PAGES_STATUS: "insufficient-pages",
  isInsufficientSourcePages: (n?: number | null) => !!n && n > 0 && n < 42,
}));
vi.mock("./step-deps", () => ({
  downloadDeps: {}, renderDeps: {}, analyzeDeps: {}, extractEntitiesDeps: {},
  reproduceDeps: {}, createBookDeps: {}, oneShotDeps: {}, fillInteriorDeps: {},
}));
vi.mock("../notify/telegram", () => ({ notifySuccess: vi.fn(), notifyFailure: vi.fn() }));
const findUnique = vi.fn(async () => ({ status: "pending", totalPages: 60, data: { classifyConfirmed: true } }));
const updateMany = vi.fn();
vi.mock("../db", () => ({
  db: {
    cloneJob: {
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      update: vi.fn(),
      updateMany: (...a: unknown[]) => updateMany(...(a as [])),
    },
  },
}));

import { processCloneJob } from "./clone-job-processor";

describe("processCloneJob — no automatic cover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ status: "pending", totalPages: 60, data: { classifyConfirmed: true } });
  });

  it("completes right after create-book, without the AI cover / meta steps", async () => {
    await processCloneJob("j1");

    expect(steps.stepCreateBook).toHaveBeenCalledTimes(1);
    expect(steps.stepGenerateCover).not.toHaveBeenCalled();
    expect(steps.stepGenerateBookMeta).not.toHaveBeenCalled();
    expect(steps.stepFinalizeCover).not.toHaveBeenCalled();
    expect(ctx.markComplete).toHaveBeenCalledWith("book-1");
  });
});

describe("processCloneJob — source page gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Nothing done yet: the job must run render first, which is what sets totalPages.
    ctx.isDone.mockImplementation(() => false);
  });

  it("parks a job whose source PDF is thinner than 42 pages, before any AI call", async () => {
    findUnique.mockResolvedValue({ status: "running", totalPages: 30, data: {} });

    await processCloneJob("j1");

    expect(steps.stepRender).toHaveBeenCalledTimes(1);
    expect(steps.stepOneShot).not.toHaveBeenCalled();
    expect(steps.stepCreateBook).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "insufficient-pages" } }),
    );
    expect(ctx.markComplete).not.toHaveBeenCalled();
  });

  it("lets a thick enough book through", async () => {
    findUnique.mockResolvedValue({ status: "running", totalPages: 48, data: { classifyConfirmed: true } });

    await processCloneJob("j1");

    expect(steps.stepOneShot).toHaveBeenCalledTimes(1);
    expect(steps.stepCreateBook).toHaveBeenCalledTimes(1);
  });
});
