export type GenerationJobType = "source-cover" | "book-export";
export type GenerationJobStatus = "pending" | "running" | "done" | "error";

/** A background image-generation job (mirrors the GenerationJob DB row). */
export interface GenerationJob {
  id: string;
  type: GenerationJobType | string;
  status: GenerationJobStatus | string;
  bookId: string;
  bookTitle?: string | null;
  payload?: {
    interiorPageId?: string;
    titleSafe?: "top" | "middle" | "bottom";
    prompt?: string;
    sourceImageUrl?: string;
    hash?: string;
  } | null;
  resultUrl?: string | null;
  resultId?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isActiveGenerationJob(j: GenerationJob): boolean {
  return j.status === "pending" || j.status === "running";
}
