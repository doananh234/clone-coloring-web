const RENDER_SCALE = 2; // 2x for crisp output
const MAX_WIDTH = 1024;

export type RenderedPage = {
  pageNumber: number;
  pngBuffer: Buffer;
  width: number;
  height: number;
};

/**
 * Polyfill missing APIs for pdfjs-dist v5 main build in Node.js:
 * - DOMMatrix/DOMPoint/DOMRect (from @napi-rs/canvas)
 * - Uint8Array.prototype.toHex (TC39 proposal, not yet in Node 24)
 */
function ensurePolyfills() {
  // DOMMatrix polyfill
  if (typeof globalThis.DOMMatrix === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const geometry = require("@napi-rs/canvas/geometry");
    globalThis.DOMMatrix = geometry.DOMMatrix;
    globalThis.DOMPoint = geometry.DOMPoint;
    globalThis.DOMRect = geometry.DOMRect;
  }

  // Uint8Array.prototype.toHex polyfill (ES2024 — not in all TS targets yet)
  if (typeof (Uint8Array.prototype as unknown as Record<string, unknown>).toHex !== "function") {
    (Uint8Array.prototype as unknown as Record<string, unknown>).toHex = function (
      this: Uint8Array,
    ) {
      return Array.from(this)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };
  }
}

/**
 * Render all pages of a PDF to PNG buffers using pdfjs-dist v5 + @napi-rs/canvas.
 */
export async function renderPdfToImages(pdfBuffer: ArrayBuffer): Promise<RenderedPage[]> {
  // Polyfill missing browser APIs before importing pdfjs-dist
  ensurePolyfills();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs" as any);

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: RenderedPage[] = [];

  const napiCanvas = await import("@napi-rs/canvas");

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Scale to fit MAX_WIDTH while maintaining aspect ratio
    const scale = Math.min(MAX_WIDTH / viewport.width, RENDER_SCALE);
    const scaledViewport = page.getViewport({ scale });

    const canvas = napiCanvas.createCanvas(scaledViewport.width, scaledViewport.height);
    const context = canvas.getContext("2d");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as any)({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    const pngBuffer = await canvas.encode("png");

    pages.push({
      pageNumber: i,
      pngBuffer: Buffer.from(pngBuffer),
      width: scaledViewport.width,
      height: scaledViewport.height,
    });

    page.cleanup();
  }

  await pdfDoc.destroy();
  return pages;
}
