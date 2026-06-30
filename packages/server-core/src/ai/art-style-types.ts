// --- Enum Constants ---

// strokeWeight is now a number (px value, e.g. 1.5, 2, 3, 4) — not an enum
export const STROKE_WEIGHT_MIN = 0.5;
export const STROKE_WEIGHT_MAX = 8;
export const STROKE_WEIGHT_STEP = 0.5;
export const LINE_QUALITY_OPTIONS = ["clean", "sketchy", "rough", "organic"] as const;
export const LINE_VARIATION_OPTIONS = ["uniform", "tapered", "calligraphic"] as const;
export const OUTLINE_STYLE_OPTIONS = ["single", "double", "broken", "none"] as const;
export const HATCHING_PATTERN_OPTIONS = ["none", "crosshatch", "stipple", "parallel"] as const;

export const DENSITY_OPTIONS = ["sparse", "moderate", "dense", "intricate"] as const;
export const SYMMETRY_OPTIONS = ["symmetric", "asymmetric", "radial", "freeform"] as const;
export const FRAMING_STYLE_OPTIONS = ["full-page", "vignette", "bordered", "floating"] as const;
export const NEGATIVE_SPACE_OPTIONS = ["generous", "balanced", "minimal"] as const;
export const FOCAL_POINT_OPTIONS = ["centered", "rule-of-thirds", "scattered", "layered"] as const;

export const SHAPE_LANGUAGE_OPTIONS = ["geometric", "organic", "mixed", "angular"] as const;
export const EDGE_TREATMENT_OPTIONS = ["sharp", "rounded", "soft", "mixed"] as const;
export const PROPORTION_STYLE_OPTIONS = ["realistic", "exaggerated", "chibi", "stylized"] as const;
export const DETAIL_LEVEL_OPTIONS = ["minimal", "moderate", "intricate", "hyper-detailed"] as const;

export const ENERGY_LEVEL_OPTIONS = ["calm", "moderate", "dynamic", "chaotic"] as const;
export const AGE_TARGET_OPTIONS = ["toddler", "kids", "teen", "adult", "all-ages"] as const;

export const FILL_PATTERN_OPTIONS = [
  "none",
  "zentangle",
  "mandala",
  "crosshatch",
  "dots",
  "mixed",
] as const;
export const BACKGROUND_TREATMENT_OPTIONS = ["blank", "simple", "detailed", "patterned"] as const;
export const DECORATIVE_ELEMENTS_OPTIONS = ["none", "minimal", "moderate", "ornate"] as const;
export const BORDER_STYLE_OPTIONS = ["none", "simple", "decorative", "themed"] as const;

export const ORIENTATION_OPTIONS = ["portrait", "landscape", "square"] as const;
export const COLORING_TIME_OPTIONS = ["5-15min", "15-30min", "30-60min", "60min+"] as const;

// --- Types ---

// All string fields accept any value — OPTIONS arrays are suggestions, not constraints.
// This allows LLM extraction to return precise descriptions (e.g. "clean with slight wobble")
// instead of being forced into a limited enum.

export interface ArtStyleLineWork {
  strokeWeight: number; // px value (e.g. 2.5)
  lineQuality: string;
  lineVariation: string;
  outlineStyle: string;
  hatchingPattern: string;
  description: string;
}

export interface ArtStyleComposition {
  density: string;
  symmetry: string;
  framingStyle: string;
  negativeSpace: string;
  focalPoint: string;
  description: string;
}

export interface ArtStyleFormAndShape {
  shapeLanguage: string;
  edgeTreatment: string;
  proportionStyle: string;
  detailLevel: string;
  description: string;
}

export interface ArtStyleMoodAndAtmosphere {
  mood: string;
  energyLevel: string;
  ageTarget: string;
  themeCategory: string;
  description: string;
}

export interface ArtStylePatternAndTexture {
  fillPattern: string;
  backgroundTreatment: string;
  decorativeElements: string;
  borderStyle: string;
  description: string;
}

export interface ArtStyleTechnical {
  orientation: string;
  complexityScore: number;
  estimatedColoringTime: (typeof COLORING_TIME_OPTIONS)[number];
  description: string;
}

export interface ArtStyleEntity {
  id: string;
  name: string;
  description: string;
  referenceImages: Array<{ url: string; label: string }>;
  thumbnailUrl: string;
  lineWork: ArtStyleLineWork;
  composition: ArtStyleComposition;
  formAndShape: ArtStyleFormAndShape;
  moodAndAtmosphere: ArtStyleMoodAndAtmosphere;
  patternAndTexture: ArtStylePatternAndTexture;
  technical: ArtStyleTechnical;
  generationDirective: string;
  tags: string[];
  sourceBookId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const EMPTY_ART_STYLE: Omit<ArtStyleEntity, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  referenceImages: [],
  thumbnailUrl: "",
  lineWork: {
    strokeWeight: 2.5,
    lineQuality: "clean",
    lineVariation: "uniform",
    outlineStyle: "single",
    hatchingPattern: "none",
    description: "",
  },
  composition: {
    density: "moderate",
    symmetry: "asymmetric",
    framingStyle: "full-page",
    negativeSpace: "balanced",
    focalPoint: "centered",
    description: "",
  },
  formAndShape: {
    shapeLanguage: "organic",
    edgeTreatment: "rounded",
    proportionStyle: "stylized",
    detailLevel: "moderate",
    description: "",
  },
  moodAndAtmosphere: {
    mood: "",
    energyLevel: "moderate",
    ageTarget: "kids",
    themeCategory: "",
    description: "",
  },
  patternAndTexture: {
    fillPattern: "none",
    backgroundTreatment: "blank",
    decorativeElements: "none",
    borderStyle: "none",
    description: "",
  },
  technical: {
    orientation: "portrait",
    complexityScore: 5,
    estimatedColoringTime: "15-30min",
    description: "",
  },
  generationDirective: "",
  tags: [],
};
