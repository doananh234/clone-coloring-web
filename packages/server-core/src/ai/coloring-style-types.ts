// --- Coloring Style Option Constants ---

// All option arrays are suggestions, not constraints.
// String fields accept any value — these guide UI dropdowns and LLM extraction.

export const TECHNIQUE_OPTIONS = [
  "watercolor",
  "crayon",
  "colored pencil",
  "digital flat",
  "marker",
  "pastel",
  "oil pastel",
  "mixed",
] as const;

export const TEXTURE_OPTIONS = ["smooth", "grainy", "streaky", "blended", "rough"] as const;

export const BACKGROUND_TONE_OPTIONS = [
  "white",
  "cream",
  "warm beige",
  "cool gray",
  "transparent",
] as const;

export const WARMTH_OPTIONS = ["warm", "cool", "neutral"] as const;

export const SATURATION_OPTIONS = ["muted", "vibrant", "pastel", "neon", "earthy"] as const;

export const SHADING_STYLE_OPTIONS = [
  "flat",
  "gradient",
  "soft shadow",
  "hard shadow",
  "none",
] as const;

export const LIGHT_DIRECTION_OPTIONS = [
  "top-left",
  "top-right",
  "ambient",
  "dramatic",
  "none",
] as const;

export const HIGHLIGHT_TREATMENT_OPTIONS = [
  "white spots",
  "light areas",
  "none",
  "sparkle",
] as const;

export const SHADOW_COLOR_OPTIONS = [
  "darker shade",
  "purple tint",
  "blue tint",
  "warm brown",
] as const;

export const EDGE_BLEED_OPTIONS = [
  "stay inside lines",
  "slight bleed",
  "artistic overflow",
] as const;

export const OPACITY_OPTIONS = ["solid", "translucent", "layered"] as const;

export const COVERAGE_OPTIONS = ["full fill", "partial", "sketch-like", "heavy impasto"] as const;

export const MOOD_OPTIONS = ["cheerful", "moody", "dreamy", "vintage", "playful"] as const;

export const AGE_FEEL_OPTIONS = ["childlike", "professional", "artistic", "whimsical"] as const;

export const FINISH_OPTIONS = ["matte", "glossy", "textured", "paper-like"] as const;

// --- Sub-Interfaces ---

export interface ColoringStyleMedium {
  technique: string;
  texture: string;
  description: string;
}

export interface ColoringStylePalette {
  primaryColors: string[];
  accentColors: string[];
  backgroundTone: string;
  warmth: string;
  saturation: string;
  description: string;
}

export interface ColoringStyleShading {
  shadingStyle: string;
  lightDirection: string;
  highlightTreatment: string;
  shadowColorTendency: string;
  description: string;
}

export interface ColoringStyleFillBehavior {
  edgeBleed: string;
  opacity: string;
  coverage: string;
  description: string;
}

export interface ColoringStyleOverallFeel {
  mood: string;
  ageFeel: string;
  finish: string;
  description: string;
}

// --- Main Entity ---

export interface ColoringStyleEntity {
  id: string;
  name: string;
  description: string;
  referenceImages: Array<{ url: string; label: string }>;
  thumbnailUrl: string;
  medium: ColoringStyleMedium;
  colorPalette: ColoringStylePalette;
  shadingAndLighting: ColoringStyleShading;
  fillBehavior: ColoringStyleFillBehavior;
  overallFeel: ColoringStyleOverallFeel;
  colorizationDirective: string;
  tags: string[];
  sourceBookId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// --- Empty Default ---

export const EMPTY_COLORING_STYLE: Omit<ColoringStyleEntity, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  referenceImages: [],
  thumbnailUrl: "",
  medium: {
    technique: "colored pencil",
    texture: "smooth",
    description: "",
  },
  colorPalette: {
    primaryColors: [],
    accentColors: [],
    backgroundTone: "white",
    warmth: "neutral",
    saturation: "vibrant",
    description: "",
  },
  shadingAndLighting: {
    shadingStyle: "soft shadow",
    lightDirection: "ambient",
    highlightTreatment: "light areas",
    shadowColorTendency: "darker shade",
    description: "",
  },
  fillBehavior: {
    edgeBleed: "stay inside lines",
    opacity: "solid",
    coverage: "full fill",
    description: "",
  },
  overallFeel: {
    mood: "cheerful",
    ageFeel: "childlike",
    finish: "matte",
    description: "",
  },
  colorizationDirective: "",
  tags: [],
};
