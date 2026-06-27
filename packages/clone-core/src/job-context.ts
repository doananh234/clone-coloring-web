import type { Firestore } from "firebase-admin/firestore";
import { STEP_ORDER, type CloneStep, type RetryRecord } from "./types";

interface CloneJobDoc {
  id: string;
  sourceBookId?: string;
  resultBookId?: string;
  currentStep?: CloneStep;
  retryHistory?: RetryRecord[];
  status?: string;
}

export class JobContext {
  private constructor(
    private readonly db: Firestore,
    public readonly jobId: string,
    public readonly sourceBookId: string | undefined,
    public readonly resultBookId: string | undefined,
    private currentStep: CloneStep | undefined,
  ) {}

  static async load(db: Firestore, jobId: string): Promise<JobContext> {
    const snap = await db.collection("cloneJobs").doc(jobId).get();
    if (!snap.exists) throw new Error(`cloneJob ${jobId} missing`);
    const data = snap.data() as CloneJobDoc;
    return new JobContext(db, jobId, data.sourceBookId, data.resultBookId, data.currentStep);
  }

  isDone(step: CloneStep): boolean {
    if (!this.currentStep) return false;
    const cursor = STEP_ORDER.indexOf(this.currentStep);
    const target = STEP_ORDER.indexOf(step);
    return target <= cursor;
  }

  async recordRetry(step: CloneStep, attempt: number, error: unknown): Promise<void> {
    const record: RetryRecord = {
      step,
      attempt,
      error: error instanceof Error ? error.message : String(error),
      at: new Date().toISOString(),
    };
    const snap = await this.db.collection("cloneJobs").doc(this.jobId).get();
    const data = (snap.data() as CloneJobDoc | undefined) ?? { id: this.jobId };
    const retryHistory = [...(data.retryHistory ?? []), record];
    await this.db.collection("cloneJobs").doc(this.jobId).update({
      retryHistory,
      updatedAt: new Date().toISOString(),
    });
  }

  async markStepComplete(step: CloneStep): Promise<void> {
    this.currentStep = step;
    await this.db.collection("cloneJobs").doc(this.jobId).update({
      currentStep: step,
      updatedAt: new Date().toISOString(),
    });
  }

  async markComplete(bookId: string): Promise<void> {
    await this.db.collection("cloneJobs").doc(this.jobId).update({
      status: "reproduced",
      resultBookId: bookId,
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async markFailed(err: unknown): Promise<void> {
    await this.db.collection("cloneJobs").doc(this.jobId).update({
      status: "error",
      failedStep: this.currentStep ?? null,
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}
