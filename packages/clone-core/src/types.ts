export type CloneStep =
  | "download"
  | "render"
  | "analyze"
  | "extract-entities"
  | "reproduce"
  | "create-book";

export const STEP_ORDER: readonly CloneStep[] = [
  "download",
  "render",
  "analyze",
  "extract-entities",
  "reproduce",
  "create-book",
] as const;

export interface RetryRecord {
  step: CloneStep;
  attempt: number;
  error: string;
  at: string;
}

export interface SourceBook {
  id: string;
  fileName: string;
  fileSize: number;
  brand: string;
  thumbnailUrl: string;
  sourcePdfUrl: string;
  niche?: string;
  priority?: string;
  selectedInCsv: boolean;
  importedFromCsv: string;
  createdAt: string;
}

export interface JobContext {
  readonly jobId: string;
  readonly sourceBookId?: string;
  readonly resultBookId?: string;
  isDone(step: CloneStep): boolean;
  recordRetry(step: CloneStep, attempt: number, error: unknown): Promise<void>;
  markStepComplete(step: CloneStep): Promise<void>;
  markComplete(bookId: string): Promise<void>;
  markFailed(err: unknown): Promise<void>;
}
