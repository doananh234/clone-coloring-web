export type CoverElementKey = "title" | "subtitle" | "brand" | "badge";
export type CoverFontWeight = 400 | 500 | 600 | 700;
export type CoverTextAlign = "left" | "center" | "right";

export interface CoverElement {
  text: string;
  fontFamily: string;
  fontWeight: CoverFontWeight;
  fontSize: number;
  color: string;
  textAlign: CoverTextAlign;
  letterSpacing: number; // px at logical canvas scale
  left: number; // fabric coords, logical canvas space
  top: number;
  visible: boolean;
}

export interface CoverDoc {
  version: 1;
  elements: Record<CoverElementKey, CoverElement>;
}

/** Logical editor canvas side (square). Export scales up to source resolution. */
export const COVER_CANVAS_SIDE = 1024;

export const ELEMENT_ORDER: CoverElementKey[] = ["title", "subtitle", "brand", "badge"];
export const ELEMENT_LABELS: Record<CoverElementKey, string> = {
  title: "Tiêu đề",
  subtitle: "Phụ đề",
  brand: "Thương hiệu",
  badge: "Nhãn (số trang)",
};

const DEFAULT_FONT = "Space Grotesk";
const S = COVER_CANVAS_SIDE;

/**
 * Per-element STYLE + LAYOUT seed extracted from the source cover. Shape mirrors
 * the server/client `CoverElementExtract` but is declared inline to keep this
 * `lib` module free of a dependency on the `data` layer (avoids an import cycle).
 * Values are normalized 0..1; NOT text content — text still comes from the seed.
 */
export interface CoverElementStyleSeed {
  present?: boolean;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  fontSizeNorm?: number;
  textAlign?: string;
  xNorm?: number;
  yNorm?: number;
}

export type CoverElementStyleSeeds = Partial<Record<CoverElementKey, CoverElementStyleSeed>>;

const isFiniteNorm = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
const isHex6 = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
const isValidWeight = (w: unknown): w is CoverFontWeight => ([400, 500, 600, 700] as number[]).includes(w as number);
const isValidAlign = (a: unknown): a is CoverTextAlign => (["left", "center", "right"] as string[]).includes(a as string);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Patch a single element's STYLE + POSITION from an extracted seed, field by
 * field with validation. Never touches `.text`. Returns a NEW element.
 */
function patchElementFromExtract(el: CoverElement, ex: CoverElementStyleSeed | undefined): CoverElement {
  if (!ex) return el;
  const next: CoverElement = { ...el };
  if (isFiniteNorm(ex.xNorm)) next.left = clamp(Math.round(ex.xNorm * S), 0, S);
  if (isFiniteNorm(ex.yNorm)) next.top = clamp(Math.round(ex.yNorm * S), 0, S);
  if (isFiniteNorm(ex.fontSizeNorm) && ex.fontSizeNorm > 0) next.fontSize = clamp(Math.round(ex.fontSizeNorm * S), 12, 400);
  if (typeof ex.fontFamily === "string" && ex.fontFamily) next.fontFamily = ex.fontFamily;
  if (isValidWeight(ex.fontWeight)) next.fontWeight = ex.fontWeight;
  if (isHex6(ex.color)) next.color = ex.color;
  if (isValidAlign(ex.textAlign)) next.textAlign = ex.textAlign;
  return next;
}

/** Per-element base style + default position (centered, stacked). */
function base(key: CoverElementKey): CoverElement {
  const common = {
    fontFamily: DEFAULT_FONT,
    textAlign: "center" as CoverTextAlign,
    letterSpacing: 0,
    left: S / 2,
    visible: true,
  };
  switch (key) {
    case "title":
      return { ...common, text: "", fontWeight: 700, fontSize: 90, color: "#0b0d0c", top: S * 0.3 };
    case "subtitle":
      return { ...common, text: "", fontWeight: 500, fontSize: 40, color: "#2b251d", top: S * 0.62 };
    case "brand":
      return { ...common, text: "", fontWeight: 600, fontSize: 34, color: "#2b251d", top: S * 0.1, visible: false };
    case "badge":
      return { ...common, text: "", fontWeight: 600, fontSize: 34, color: "#1a1712", top: S * 0.88 };
  }
}

export function defaultCoverDoc(seed: {
  title?: string; subtitle?: string; brand?: string; badge?: string;
  titleFont?: string; titleColor?: string;
  /** Per-element extracted STYLE + LAYOUT from the source cover (norm 0..1). */
  elements?: CoverElementStyleSeeds;
}): CoverDoc {
  const elements = {
    title: base("title"),
    subtitle: base("subtitle"),
    brand: base("brand"),
    badge: base("badge"),
  };
  // TEXT comes from the seed (the NEW book's content) — never from extraction.
  elements.title.text = seed.title ?? "";
  elements.subtitle.text = seed.subtitle ?? "";
  elements.badge.text = seed.badge ?? "";
  if (seed.brand) { elements.brand.text = seed.brand; elements.brand.visible = true; }
  if (seed.titleFont) elements.title.fontFamily = seed.titleFont;
  if (seed.titleColor && /^#[0-9a-fA-F]{6}$/.test(seed.titleColor)) elements.title.color = seed.titleColor;

  // Apply extracted STYLE + POSITION per element (title/subtitle/brand/badge).
  // Only override base() when the source cover actually shows that role.
  const ex = seed.elements;
  if (ex) {
    for (const key of ELEMENT_ORDER) {
      const e = ex[key];
      if (e?.present) {
        elements[key] = patchElementFromExtract(elements[key], e);
        elements[key].visible = true;
      }
    }
  }

  // Hide empty optional elements by default so the canvas starts clean. A role
  // present on the source cover but with no seed text stays hidden until filled.
  if (!elements.subtitle.text) elements.subtitle.visible = false;
  if (!elements.badge.text) elements.badge.visible = false;
  if (!elements.brand.text) elements.brand.visible = false;
  return { version: 1, elements };
}

/**
 * Return a NEW doc with each element's STYLE + POSITION patched from extracted
 * per-element data (same field-by-field validation as seeding). Leaves every
 * element's `.text` untouched. Used by "Trích lại style" re-apply.
 */
export function applyExtractedStyles(doc: CoverDoc, elements: CoverElementStyleSeeds | undefined): CoverDoc {
  if (!elements) return doc;
  const next = { ...doc.elements };
  for (const key of ELEMENT_ORDER) {
    const e = elements[key];
    if (e?.present) next[key] = patchElementFromExtract(next[key], e);
  }
  return { version: 1, elements: next };
}

function coerceElement(key: CoverElementKey, raw: unknown): CoverElement {
  const def = base(key);
  if (!raw || typeof raw !== "object") return def;
  const r = raw as Partial<CoverElement>;
  return {
    text: typeof r.text === "string" ? r.text : def.text,
    fontFamily: typeof r.fontFamily === "string" && r.fontFamily ? r.fontFamily : def.fontFamily,
    fontWeight: ([400, 500, 600, 700] as number[]).includes(r.fontWeight as number) ? (r.fontWeight as CoverFontWeight) : def.fontWeight,
    fontSize: typeof r.fontSize === "number" && r.fontSize > 0 ? r.fontSize : def.fontSize,
    color: typeof r.color === "string" && r.color ? r.color : def.color,
    textAlign: (["left", "center", "right"] as string[]).includes(r.textAlign as string) ? (r.textAlign as CoverTextAlign) : def.textAlign,
    letterSpacing: typeof r.letterSpacing === "number" ? r.letterSpacing : def.letterSpacing,
    left: typeof r.left === "number" ? r.left : def.left,
    top: typeof r.top === "number" ? r.top : def.top,
    visible: typeof r.visible === "boolean" ? r.visible : def.visible,
  };
}

export function normalizeCoverDoc(
  raw: unknown,
  seed: Parameters<typeof defaultCoverDoc>[0],
): CoverDoc {
  const fallback = defaultCoverDoc(seed);
  if (!raw || typeof raw !== "object") return fallback;
  const rawEls = (raw as { elements?: Record<string, unknown> }).elements ?? {};
  const elements = {
    title: coerceElement("title", rawEls.title),
    subtitle: coerceElement("subtitle", rawEls.subtitle),
    brand: coerceElement("brand", rawEls.brand),
    badge: coerceElement("badge", rawEls.badge),
  };
  // If a stored element has no text, keep the seed text (first-open convenience).
  if (!elements.title.text && fallback.elements.title.text) elements.title.text = fallback.elements.title.text;
  return { version: 1, elements };
}
