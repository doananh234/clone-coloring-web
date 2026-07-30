import { describe, it, expect } from "vitest";
import { defaultCoverDoc, normalizeCoverDoc, applyExtractedStyles, docToOverlayElements, ELEMENT_ORDER, COVER_CANVAS_SIDE } from "./cover-doc";

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

  it("defaultCoverDoc applies extracted style+layout (norm→1024) for present elements", () => {
    const doc = defaultCoverDoc({
      title: "Dino",
      elements: {
        title: { present: true, xNorm: 0.25, yNorm: 0.5, fontSizeNorm: 0.1, fontFamily: "Chewy", fontWeight: 600, color: "#123456", textAlign: "left" },
      },
    });
    const t = doc.elements.title;
    expect(t.left).toBe(Math.round(0.25 * COVER_CANVAS_SIDE)); // 256
    expect(t.top).toBe(Math.round(0.5 * COVER_CANVAS_SIDE)); // 512
    expect(t.fontSize).toBe(Math.round(0.1 * COVER_CANVAS_SIDE)); // 102
    expect(t.fontFamily).toBe("Chewy");
    expect(t.fontWeight).toBe(600);
    expect(t.color).toBe("#123456");
    expect(t.textAlign).toBe("left");
    expect(t.text).toBe("Dino"); // text still from seed, not extraction
    expect(t.visible).toBe(true);
  });

  it("defaultCoverDoc falls back to base() defaults for invalid/missing extract fields", () => {
    const clean = defaultCoverDoc({ title: "T" });
    const base = clean.elements.title;
    const doc = defaultCoverDoc({
      title: "T",
      elements: {
        // present but every value invalid/out-of-range → keep base() defaults
        title: { present: true, xNorm: 5, yNorm: -1, fontSizeNorm: 0, fontFamily: "", fontWeight: 999, color: "red", textAlign: "diagonal" },
      },
    });
    const t = doc.elements.title;
    expect(t.left).toBe(base.left);
    expect(t.top).toBe(base.top);
    expect(t.fontSize).toBe(base.fontSize);
    expect(t.fontFamily).toBe(base.fontFamily);
    expect(t.fontWeight).toBe(base.fontWeight);
    expect(t.color).toBe(base.color);
    expect(t.textAlign).toBe(base.textAlign);
  });

  it("defaultCoverDoc hides an element whose extract is present:false", () => {
    const clean = defaultCoverDoc({ title: "T", subtitle: "sub" });
    const doc = defaultCoverDoc({
      title: "T",
      subtitle: "sub",
      // present:false → extract ignored, element keeps its base position/style
      elements: { subtitle: { present: false, xNorm: 0.9, yNorm: 0.9 } },
    });
    expect(doc.elements.subtitle.left).toBe(clean.elements.subtitle.left);
    expect(doc.elements.subtitle.top).toBe(clean.elements.subtitle.top);
    // an element that is present:false and NOT seeded stays hidden
    const doc2 = defaultCoverDoc({ title: "T", elements: { badge: { present: false } } });
    expect(doc2.elements.badge.visible).toBe(false);
  });

  it("applyExtractedStyles patches style+position but keeps text", () => {
    const doc = defaultCoverDoc({ title: "Keep me", subtitle: "sub", badge: "24" });
    const patched = applyExtractedStyles(doc, {
      title: { present: true, xNorm: 0.75, yNorm: 0.2, color: "#abcdef", fontFamily: "Fredoka" },
      badge: { present: true, fontSizeNorm: 0.05 },
    });
    expect(patched.elements.title.text).toBe("Keep me"); // text untouched
    expect(patched.elements.title.left).toBe(Math.round(0.75 * COVER_CANVAS_SIDE));
    expect(patched.elements.title.top).toBe(Math.round(0.2 * COVER_CANVAS_SIDE));
    expect(patched.elements.title.color).toBe("#abcdef");
    expect(patched.elements.title.fontFamily).toBe("Fredoka");
    expect(patched.elements.badge.fontSize).toBe(Math.round(0.05 * COVER_CANVAS_SIDE));
    expect(patched.elements.badge.text).toBe("24"); // text untouched
    // returns a NEW doc (immutability)
    expect(patched).not.toBe(doc);
    expect(patched.elements.title).not.toBe(doc.elements.title);
  });

  it("applyExtractedStyles is a no-op when elements is undefined", () => {
    const doc = defaultCoverDoc({ title: "T" });
    expect(applyExtractedStyles(doc, undefined)).toBe(doc);
  });

  it("docToOverlayElements round-trips left/top/fontSize/font/color/align via applyExtractedStyles", () => {
    // All 4 roles seeded + visible so applyExtractedStyles patches each (it only
    // touches present:true elements, and docToOverlayElements sets present=visible).
    const doc = defaultCoverDoc({
      title: "Dino", subtitle: "for kids", brand: "Acme", badge: "24 trang",
      elements: {
        title: { present: true, xNorm: 0.25, yNorm: 0.5, fontSizeNorm: 0.1, fontFamily: "Chewy", fontWeight: 600, color: "#123456", textAlign: "left" },
        subtitle: { present: true, xNorm: 0.5, yNorm: 0.62, fontSizeNorm: 0.04, fontFamily: "Fredoka", fontWeight: 500, color: "#2b251d", textAlign: "center" },
        brand: { present: true, xNorm: 0.5, yNorm: 0.1, fontSizeNorm: 0.033, fontFamily: "Poppins", fontWeight: 600, color: "#000000", textAlign: "right" },
        badge: { present: true, xNorm: 0.5, yNorm: 0.88, fontSizeNorm: 0.033, fontFamily: "Inter", fontWeight: 700, color: "#1a1712", textAlign: "center" },
      },
    });
    const base = defaultCoverDoc({ title: "Dino", subtitle: "for kids", brand: "Acme", badge: "24 trang" });
    const round = applyExtractedStyles(base, docToOverlayElements(doc));
    for (const key of ELEMENT_ORDER) {
      const a = round.elements[key];
      const b = doc.elements[key];
      // integers in the doc → norm→px clamp(round(...)) lands back on same integer
      expect(a.left).toBe(b.left);
      expect(a.top).toBe(b.top);
      expect(a.fontSize).toBe(b.fontSize);
      expect(a.fontFamily).toBe(b.fontFamily);
      expect(a.fontWeight).toBe(b.fontWeight);
      expect(a.color).toBe(b.color);
      expect(a.textAlign).toBe(b.textAlign);
    }
  });

  it("docToOverlayElements sets present from element visibility", () => {
    const doc = defaultCoverDoc({ title: "T" }); // subtitle/brand/badge hidden
    const els = docToOverlayElements(doc);
    expect(els.title.present).toBe(true);
    expect(els.subtitle.present).toBe(false);
    expect(els.title.fontSizeNorm).toBeCloseTo(doc.elements.title.fontSize / COVER_CANVAS_SIDE);
  });
});
