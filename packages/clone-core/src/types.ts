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
  fileSize: string;
  brand: string;
  thumbnailUrl: string;
  sourcePdfUrl: string;
  niche?: string;
  priority?: string;
  selectedInCsv: boolean;
  importedFromCsv: string;
  createdAt: string;
}

