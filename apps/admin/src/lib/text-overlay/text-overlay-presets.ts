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

/** Extended font catalog for "More fonts..." picker, grouped by vibe. */
export const FONT_CATALOG: { category: string; fonts: string[] }[] = [
  {
    category: "Playful",
    fonts: ["Fredoka One", "Bubblegum Sans", "Baloo 2", "Luckiest Guy", "Boogaloo"],
  },
  {
    category: "Elegant",
    fonts: ["Playfair Display", "Dancing Script", "Great Vibes", "Cormorant Garamond"],
  },
  {
    category: "Bold",
    fonts: ["Bebas Neue", "Oswald", "Anton", "Black Ops One", "Righteous"],
  },
  {
    category: "Handdrawn",
    fonts: ["Caveat", "Patrick Hand", "Indie Flower", "Shadows Into Light"],
  },
  {
    category: "Clean",
    fonts: ["Poppins", "Montserrat", "Raleway", "Nunito"],
  },
];

/** Flat list of all available fonts. */
export const ALL_FONTS: string[] = FONT_CATALOG.flatMap((g) => g.fonts);

/** Default preset ID. */
export const DEFAULT_PRESET_ID = "playful";
