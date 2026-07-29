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
});
