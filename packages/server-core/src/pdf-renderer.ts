import { createRequire } from "node:module";

// `@vx/server-core` is "type": "module" — pdfjs-dist needs CJS require for its
// legacy main build and for `require.resolve("…/package.json")`. Bind a
// CJS-compatible require to this module's URL.
const require = createRequire(import.meta.url);

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

  // ImageData polyfill (required by pdfjs-dist canvas renderer in Node.js)
  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class ImageData {
      readonly data: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
      readonly colorSpace: PredefinedColorSpace;

      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        heightOrSettings?: number | ImageDataSettings,
      ) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height =
            typeof heightOrSettings === "number"
              ? heightOrSettings
              : dataOrWidth.length / (widthOrHeight * 4);
        }
        this.colorSpace = "srgb";
      }
    } as unknown as typeof ImageData;
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

  // Map.prototype.getOrInsertComputed polyfill (TC39 Stage 3 — required by pdfjs-dist v5.7+)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MapProto = Map.prototype as any;
  if (typeof MapProto.getOrInsertComputed !== "function") {
    MapProto.getOrInsertComputed = function <K, V>(
      this: Map<K, V>,
      key: K,
      callbackFn: (key: K) => V,
    ): V {
      if (this.has(key)) return this.get(key)!;
      const value = callbackFn(key);
      this.set(key, value);
      return value;
    };
  }
}

/**
 * Render all pages of a PDF to PNG buffers using pdfjs-dist v5 + @napi-rs/canvas.
 */
export async function renderPdfToImages(pdfBuffer: ArrayBuffer): Promise<RenderedPage[]> {
  // Polyfill missing browser APIs before importing pdfjs-dist
  ensurePolyfills();

  // CJS helpers must come BEFORE the dynamic import so we can resolve
  // pdfjs-dist via a real file:// URL. When this module is loaded by tsx
  // it lives at a `data:text/javascript,...` URL, and Node's ESM resolver
  // rejects bare specifiers from non-hierarchical bases. require.resolve
  // (CJS) anchors to the actual on-disk path and always works.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require("node:path") as typeof import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pathToFileURL } = require("node:url") as typeof import("node:url");

  // Legacy build avoids Promise.try (Node 22 lacks it) and is the
  // officially-recommended build for Node.js environments.
  const pdfjsEntry = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  // Wrap dynamic import in `new Function` so bundlers (turbopack/webpack)
  // cannot statically analyze the expression and reject it as "too dynamic".
  // pdfjs-dist is already in next.config.ts serverExternalPackages, so it
  // stays out of the bundle and Node resolves it at runtime as expected.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dynamicImport = new Function("p", "return import(p)") as (p: string) => Promise<any>;
  const pdfjsLib = await dynamicImport(pathToFileURL(pdfjsEntry).href);

  // Standard fonts must be loadable in Node, or glyphs render as empty boxes.
  // wasmUrl is required for JBig2/JPEG2000-compressed images (common in
  // scanned/line-art PDFs). Without it, those XObjects are silently dropped
  // and pages render blank — exactly the symptom for coloring-book PDFs.
  const pdfjsPkgPath = require.resolve("pdfjs-dist/package.json");
  const pdfjsRoot = nodePath.dirname(pdfjsPkgPath);
  const standardFontDataUrl = nodePath.join(pdfjsRoot, "standard_fonts") + nodePath.sep;
  const wasmUrl = pathToFileURL(nodePath.join(pdfjsRoot, "wasm") + nodePath.sep).href;

  // Use require (createRequire-bound) instead of `await import()` because
  // tsx loads this module as a data: URL and Node's ESM resolver rejects
  // bare specifiers from non-hierarchical bases. @napi-rs/canvas is CJS.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const napiCanvas = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");

  // pdfjs-dist v5 needs a CanvasFactory that knows how to create off-screen
  // canvases in Node (patterns, transparency groups, tiling all use this).
  // Without it, complex pages render blank/partial even when the main canvas works.
  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = napiCanvas.createCanvas(Math.max(1, width), Math.max(1, height));
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(
      canvasAndContext: { canvas: { width: number; height: number } },
      width: number,
      height: number,
    ) {
      canvasAndContext.canvas.width = Math.max(1, width);
      canvasAndContext.canvas.height = Math.max(1, height);
    }
    destroy(canvasAndContext: {
      canvas: { width: number; height: number } | null;
      context: unknown;
    }) {
      if (canvasAndContext.canvas) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }
  const canvasFactory = new NodeCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl,
    wasmUrl,
    CanvasFactory: NodeCanvasFactory,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Scale to fit MAX_WIDTH while maintaining aspect ratio
    const scale = Math.min(MAX_WIDTH / viewport.width, RENDER_SCALE);
    const scaledViewport = page.getViewport({ scale });

    const canvas = napiCanvas.createCanvas(scaledViewport.width, scaledViewport.height);
    const context = canvas.getContext("2d");

    // Paint a solid white background — many PDFs have transparent backgrounds.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, scaledViewport.width, scaledViewport.height);

    // pdfjs-dist v5 RenderParameters: pass `canvas` AND a `canvasFactory` so
    // off-screen surfaces use @napi-rs/canvas too (default factory fails in Node).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as any)({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
      canvasFactory,
      background: "white",
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
