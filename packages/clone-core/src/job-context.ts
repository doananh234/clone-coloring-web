import type { PrismaClient } from "@vx/db";
import { STEP_ORDER, type CloneStep, type RetryRecord } from "./types";
import { StepFailedError } from "./retry";

// Fields stored inside the CloneJob.data Json column.
interface CloneJobDataExtras {
  currentStep?: CloneStep;
  retryHistory?: RetryRecord[];
  sourceBookId?: string;
  failedStep?: CloneStep | null;
  startedAt?: string;
  finishedAt?: string;
  /** D3 per-job override for interior target; falls back to DEFAULT_TARGET_INTERIOR. */
  targetInteriorCount?: number;
  [k: string]: unknown;
}

export class JobContext {
  private constructor(
    private readonly db: PrismaClient,
    public readonly jobId: string,
    public readonly sourceBookId: string | undefined,
    public readonly resultBookId: string | undefined,
    private currentStep: CloneStep | undefined,
  ) {}

  static async load(db: PrismaClient, jobId: string): Promise<JobContext> {
    const job = await db.cloneJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`cloneJob ${jobId} missing`);
    const data = (job.data as CloneJobDataExtras | null | undefined) ?? {};
    const sourceBookId = data.sourceBookId;
    const resultBookId = job.resultBookId ?? undefined;
    const currentStep = data.currentStep;
    return new JobContext(db, jobId, sourceBookId, resultBookId ?? undefined, currentStep);
  }

  isDone(step: CloneStep): boolean {
    if (!this.currentStep) return false;
    const cursor = STEP_ORDER.indexOf(this.currentStep);
    const target = STEP_ORDER.indexOf(step);
    return target <= cursor;
  }

  // Read the current `data` JSON blob so we can do a read-modify-write that
  // preserves other keys not owned by this context.
  private async readData(): Promise<CloneJobDataExtras> {
    const job = await this.db.cloneJob.findUnique({
      where: { id: this.jobId },
      select: { data: true },
    });
    return ((job?.data as CloneJobDataExtras | null | undefined) ?? {}) as CloneJobDataExtras;
  }

  // NOTE: All writes use `updateMany` so a deleted CloneJob (e.g., admin UI
  // Delete pressed during a long one-shot call) silently no-ops instead of
  // throwing P2025 and cascading through markFailed → the worker's catch
  // handler → an unrecoverable job crash.

  async recordRetry(step: CloneStep, attempt: number, error: unknown): Promise<void> {
    const record: RetryRecord = {
      step,
      attempt,
      error: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    };
    const prev = await this.readData();
    const retryHistory = [...(prev.retryHistory ?? []), record];
    await this.db.cloneJob.updateMany({
      where: { id: this.jobId },
      data: { data: { ...prev, retryHistory } as never },
    });
  }

  async markStepComplete(step: CloneStep): Promise<void> {
    this.currentStep = step;
    const prev = await this.readData();
    await this.db.cloneJob.updateMany({
      where: { id: this.jobId },
      data: { data: { ...prev, currentStep: step } as never },
    });
  }

  async markComplete(bookId: string): Promise<void> {
    const prev = await this.readData();
    await this.db.cloneJob.updateMany({
      where: { id: this.jobId },
      data: {
        status: "reproduced",
        resultBookId: bookId,
        data: { ...prev, finishedAt: new Date().toISOString() } as never,
      },
    });
  }

  async markFailed(err: unknown): Promise<void> {
    const prev = await this.readData();
    // Prefer the step carried by StepFailedError — currentStep tracks the
    // LAST COMPLETED step, so using it here mislabels the failure as the step
    // that came just before (e.g. "create-book" instead of "generate-cover").
    const failedStep =
      err instanceof StepFailedError ? err.step : (this.currentStep ?? null);
    await this.db.cloneJob.updateMany({
      where: { id: this.jobId },
      data: {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        data: {
          ...prev,
          failedStep,
          finishedAt: new Date().toISOString(),
        } as never,
      },
    });
  }
}
