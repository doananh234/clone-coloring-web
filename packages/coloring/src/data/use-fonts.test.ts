import { describe, it, expect, vi, beforeEach } from "vitest";
import { injectFontFaces } from "./use-fonts";

class FakeFontFace {
  family: string;
  constructor(family: string) {
    this.family = family;
  }
  load() {
    return Promise.resolve(this);
  }
}

class FailingFakeFontFace {
  family: string;
  constructor(family: string) {
    this.family = family;
  }
  load() {
    return Promise.reject(new Error("network error"));
  }
}

describe("injectFontFaces", () => {
  beforeEach(() => {
    const added: unknown[] = [];
    // @ts-expect-error test stub
    globalThis.FontFace = FakeFontFace;
    // @ts-expect-error test stub
    document.fonts = { add: (f: unknown) => added.push(f), _added: added, has: () => false };
  });

  it("registers each font family once", () => {
    injectFontFaces([{ id: "1", name: "Foo", fileUrl: "https://r2/foo.woff2", format: "woff2" }]);
    injectFontFaces([{ id: "1", name: "Foo", fileUrl: "https://r2/foo.woff2", format: "woff2" }]);
    // @ts-expect-error test stub
    expect(document.fonts._added.length).toBe(1);
  });

  it("removes a failed FontFace from document.fonts so a retry doesn't duplicate it", async () => {
    // @ts-expect-error test stub
    globalThis.FontFace = FailingFakeFontFace;
    const added: unknown[] = [];
    const deleted: unknown[] = [];
    // @ts-expect-error test stub
    document.fonts = {
      add: (f: unknown) => added.push(f),
      delete: (f: unknown) => {
        deleted.push(f);
        const idx = added.indexOf(f);
        if (idx !== -1) added.splice(idx, 1);
      },
      has: () => false,
    };

    injectFontFaces([{ id: "2", name: "Bar", fileUrl: "https://r2/bar.woff2", format: "woff2" }]);
    // flush the load().catch() microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(deleted.length).toBe(1);
    expect(added.length).toBe(0);

    // Retry after failure should not leave a duplicate/stale entry.
    injectFontFaces([{ id: "2", name: "Bar", fileUrl: "https://r2/bar.woff2", format: "woff2" }]);
    expect(added.length).toBe(1);
  });
});
