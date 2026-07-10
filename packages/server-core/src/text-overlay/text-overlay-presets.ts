import type { TextPreset } from "./text-overlay-types";

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: "playful",
    name: "Playful",
    fontFamily: "Fredoka One",
    color: "#FFFFFF",
    outlineColor: "#333333",
    outlineWidth: 3,
    shadow: true,
  },
  {
    id: "elegant",
    name: "Elegant",
    fontFamily: "Playfair Display",
    color: "#1a1a1a",
    outlineColor: "transparent",
    outlineWidth: 0,
    shadow: true,
  },
  {
    id: "bold",
    name: "Bold",
    fontFamily: "Bebas Neue",
    color: "#FFFFFF",
    outlineColor: "#000000",
    outlineWidth: 4,
    shadow: true,
  },
  {
    id: "handdrawn",
    name: "Handdrawn",
    fontFamily: "Caveat",
    color: "#4a3728",
    outlineColor: "#FFFFFF",
    outlineWidth: 2,
    shadow: false,
  },
  {
    id: "clean",
    name: "Clean",
    fontFamily: "Poppins",
    color: "#FFFFFF",
    outlineColor: "#555555",
    outlineWidth: 2,
    shadow: true,
  },
];

/** Extended font catalog for "More fonts..." picker. 20+ curated Google Fonts. */
export const FONT_CATALOG = [
  // Display / decorative — for titles
  { id: "fredoka", family: "Fredoka", weights: [400, 500, 700] },
  { id: "bubblegum", family: "Bubblegum Sans", weights: [400] },
  { id: "bungee", family: "Bungee", weights: [400] },
  { id: "pacifico", family: "Pacifico", weights: [400] },
  { id: "lobster", family: "Lobster", weights: [400] },
  { id: "righteous", family: "Righteous", weights: [400] },
  { id: "chewy", family: "Chewy", weights: [400] },
  { id: "kalam", family: "Kalam", weights: [400, 700] },
  // Body / clean sans — for subtitles and brand lines
  { id: "inter", family: "Inter", weights: [400, 500, 700] },
  { id: "roboto", family: "Roboto", weights: [400, 500, 700] },
  { id: "nunito", family: "Nunito", weights: [400, 700] },
  { id: "poppins", family: "Poppins", weights: [400, 600, 700] },
  { id: "comfortaa", family: "Comfortaa", weights: [400, 700] },
  { id: "quicksand", family: "Quicksand", weights: [400, 700] },
  { id: "dm-sans", family: "DM Sans", weights: [400, 500, 700] },
  { id: "outfit", family: "Outfit", weights: [400, 600] },
  // Serif — editorial
  { id: "playfair", family: "Playfair Display", weights: [400, 700] },
  { id: "merriweather", family: "Merriweather", weights: [400, 700] },
  { id: "lora", family: "Lora", weights: [400, 700] },
  { id: "dm-serif", family: "DM Serif Display", weights: [400] },
  // Handwritten / script — for brand, byline, imprint. Warm & cozy vibe,
  // matches the KDP-style small-signature-at-the-bottom convention.
  { id: "caveat", family: "Caveat", weights: [400, 700] },
  { id: "sacramento", family: "Sacramento", weights: [400] },
  { id: "satisfy", family: "Satisfy", weights: [400] },
  { id: "shadows-into-light", family: "Shadows Into Light", weights: [400] },
  { id: "amatic-sc", family: "Amatic SC", weights: [400, 700] },
  { id: "dancing-script", family: "Dancing Script", weights: [400, 700] },
  { id: "homemade-apple", family: "Homemade Apple", weights: [400] },
  { id: "gochi-hand", family: "Gochi Hand", weights: [400] },
  { id: "patrick-hand", family: "Patrick Hand", weights: [400] },
  { id: "indie-flower", family: "Indie Flower", weights: [400] },
] as const;

/** Flat list of all available fonts. */
export const ALL_FONTS: string[] = FONT_CATALOG.map((f) => f.family);

/** Default preset ID. */
export const DEFAULT_PRESET_ID = "playful";
