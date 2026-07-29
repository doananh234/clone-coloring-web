import { describe, it, expect } from "vitest";
import { defaultCoverDoc, normalizeCoverDoc, ELEMENT_ORDER, COVER_CANVAS_SIDE } from "./cover-doc";

describe("cover-doc", () => {
  it("defaultCoverDoc seeds title/subtitle/badge text and all 4 elements", () => {
    const doc = defaultCoverDoc({ title: "Dino", subtitle: "For kids", badge: "24 trang" });
    expect(doc.version).toBe(1);
    expect(Object.keys(doc.elements).sort()).toEqual([...ELEMENT_ORDER].sort());
    expect(doc.elements.title.text).toBe("Dino");
    expect(doc.elements.subtitle.text).toBe("For kids");
    expect(doc.elements.badge.text).toBe("24 trang");
    // brand defaults empty + hidden when no seed
    expect(doc.elements.brand.text).toBe("");
    expect(doc.elements.brand.visible).toBe(false);
    // positions inside the logical canvas
    expect(doc.elements.title.top).toBeGreaterThan(0);
    expect(doc.elements.title.top).toBeLessThan(COVER_CANVAS_SIDE);
  });

  it("defaultCoverDoc applies title font/color seed", () => {
    const doc = defaultCoverDoc({ title: "T", titleFont: "Chewy", titleColor: "#ff0000" });
    expect(doc.elements.title.fontFamily).toBe("Chewy");
    expect(doc.elements.title.color).toBe("#ff0000");
  });

  it("normalizeCoverDoc fills missing elements from defaults", () => {
    const partial = { version: 1, elements: { title: { text: "Kept", left: 100, top: 100, visible: true } } };
    const doc = normalizeCoverDoc(partial, { title: "Seed" });
    expect(doc.elements.title.text).toBe("Kept");
    expect(doc.elements.title.left).toBe(100);
    // subtitle/brand/badge back-filled
    expect(doc.elements.subtitle).toBeDefined();
    expect(doc.elements.badge).toBeDefined();
    expect(doc.elements.title.fontFamily).toBeTruthy(); // filled from default
  });

  it("normalizeCoverDoc tolerates null/garbage", () => {
    expect(normalizeCoverDoc(null, { title: "X" }).elements.title.text).toBe("X");
    expect(normalizeCoverDoc("nope", { title: "X" }).elements.title.text).toBe("X");
  });
});
