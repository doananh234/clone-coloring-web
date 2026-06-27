import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { JobContext } from "../job-context";

interface JobPage {
  pageNumber: number;
  imageUrl: string;
  redesignedUrl?: string;
  rawData?: unknown;
}

export interface CreateBookDeps {
  randomUUID: () => string;
}

export async function stepCreateBook(
  ctx: JobContext,
  db: Firestore,
  deps: CreateBookDeps,
): Promise<string> {
  if (ctx.resultBookId) return ctx.resultBookId;

  const ref = db.collection("cloneJobs").doc(ctx.jobId);
  const snap = await ref.get();
  const job = snap.data() as {
    name?: string;
    sourceFileName?: string;
    sourceBookId?: string;
    pages: JobPage[];
    bookData?: { title?: string; subtitle?: string; description?: string; categoryId?: string; ageRange?: string; artStyleId?: string };
  };

  const bookId = deps.randomUUID();
  const title = job.bookData?.title || job.name || job.sourceFileName?.replace(/\.pdf$/i, "") || "Untitled";

  await db.collection("books").doc(bookId).set({
    title,
    subtitle: job.bookData?.subtitle || "",
    description: job.bookData?.description || "",
    categoryId: job.bookData?.categoryId || null,
    ageRange: job.bookData?.ageRange || null,
    artStyleId: job.bookData?.artStyleId || null,
    sourceCloneJobId: ctx.jobId,
    sourceBookId: ctx.sourceBookId ?? null,
    pages: job.pages.map((p) => ({
      pageNumber: p.pageNumber,
      imageUrl: p.redesignedUrl ?? p.imageUrl,
    })),
    status: "draft",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await ref.update({
    resultBookId: bookId,
    bookId,
    updatedAt: new Date().toISOString(),
  });

  await ctx.markStepComplete("create-book");
  return bookId;
}
