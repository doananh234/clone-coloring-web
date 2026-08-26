import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { copyPdfPages } from "./pdf-trim";

/**
 * The only test in the clone trim path that exercises real pdf-lib — every
 * layer above it (stepTrimPdf, stepOneShot) mocks copyPdfPages, so this is
 * where a genuine round-trip is proven.
 */
async function makePdf(pageWidths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of pageWidths) doc.addPage([w, 100]);
  return doc.save();
}

describe("copyPdfPages", () => {
  it("keeps only the requested pages", async () => {
    const src = await makePdf([100, 200, 300]);

    const out = await copyPdfPages(src, [0, 2]);

    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    // Page widths identify which originals survived: 100 (page 1) and 300 (page 3).
    expect(reloaded.getPages().map((p) => Math.round(p.getWidth()))).toEqual([100, 300]);
  });

  it("follows the caller's order rather than sorting", async () => {
    const src = await makePdf([100, 200, 300]);

    const out = await copyPdfPages(src, [2, 0]);

    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPages().map((p) => Math.round(p.getWidth()))).toEqual([300, 100]);
  });

  it("round-trips the whole document when every page is kept", async () => {
    const src = await makePdf([100, 200, 300]);

    const out = await copyPdfPages(src, [0, 1, 2]);

    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(3);
    expect(reloaded.getPages().map((p) => Math.round(p.getWidth()))).toEqual([100, 200, 300]);
  });
});
