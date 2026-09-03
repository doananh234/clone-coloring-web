export type CloneStep =
  | "download"
  | "render"
  | "trim-pdf"
  | "analyze"
  | "extract-entities"
  | "reproduce"
  | "fill-interior"
  | "create-book"
  | "generate-cover"
  | "generate-book-meta"
  | "finalize-cover";

export const STEP_ORDER: readonly CloneStep[] = [
  "download",
  "render",
  "trim-pdf",
  "analyze",
  "extract-entities",
  "reproduce",
  "fill-interior",
  "create-book",
  "generate-cover",
  "generate-book-meta",
  "finalize-cover",
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

