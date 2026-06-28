// Placeholder — real implementation lands in T7.
interface MinimalCtx {
  jobId: string;
  sourceBookId?: string;
}

export async function notifySuccess(_ctx: MinimalCtx, _bookId: string): Promise<void> {
  // no-op until T7
}

export async function notifyFailure(_ctx: MinimalCtx, _err: unknown): Promise<void> {
  // no-op until T7
}
