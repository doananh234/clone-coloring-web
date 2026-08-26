import { PDFDocument } from "pdf-lib";

/**
 * Copy a subset of pages out of a PDF into a new document.
 *
 * `keepIndices` are 0-based and are applied in the order given, so the output
 * page order follows the caller's list. Callers that need ascending order must
 * sort before calling.
 */
export async function copyPdfPages(
  pdf: Uint8Array,
  keepIndices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, keepIndices);
  for (const page of copied) out.addPage(page);
  return out.save();
}
