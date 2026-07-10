/**
 * Types for the text overlay system.
 * Used by both client (modal preview) and server (canvas rendering).
 */

/**
 * Serialized Fabric.js 7 canvas state (result of `fabric.Canvas.toJSON()`).
 * Opaque schema — Fabric-version-locked. Whole blob is stored in
 * Book.data.coverMeta.scene and reloaded via fabric.Canvas.loadFromJSON.
 */
export type FabricSceneJSON = {
  version: string;
  objects: Array<Record<string, unknown>>;
  background?: string;
  [k: string]: unknown;
};

/**
 * Client-side background CSS filter presets. Both client (fabric.Image.filters)
 * and server (@napi-rs/canvas pixel math) apply identical numeric parameters
 * so preview and export match.
 */
export type StyleFilter =
  | "none"
  | "vintage"
  | "warm"
  | "cool"
  | "monochrome"
  | "sepia"
  | "pastel";

/**
 * Everything the cover editor / cover-generation worker persists on
 * Book.data.coverMeta. `scene`, `editedAt`, `filter` are populated only
 * when the user has manually edited via the cover editor.
 */
export interface CoverMeta {
  titleCover: string;
  subtitle: string;
  brandId: string;
  coloringStyleId: string;
  sourceThumbnailUrl: string;
  middlePageIndex: number;
  presetId: string;
  status: "generated" | "failed" | "manual";
  generatedAt: string;
  error?: string;
  // NEW — set by the cover editor when the user saves manually:
  scene?: FabricSceneJSON;
  editedAt?: string;
  filter?: StyleFilter;
}

export type TextBlockConfig = {
  text: string;
  fontFamily: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  position: HeaderPosition | FooterPosition;
  scale: number;
};

export type HeaderPosition = "top" | "center";
export type FooterPosition = "bottom-left" | "bottom-center" | "bottom-right";

export type TextOverlayConfig = {
  header: TextBlockConfig | null;
  footer: TextBlockConfig | null;
};

export type TextPreset = {
  id: string;
  name: string;
  fontFamily: string;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
};

export type TextOverlayRequest = {
  imageUrl: string;
  header: TextBlockConfig | null;
  footer: TextBlockConfig | null;
};

export type TextOverlayResponse = {
  success: true;
  previewUrl: string;
  base64: string;
};

export type TextOverlayBlendRequest = {
  imageBase64: string;
  prompt?: string;
};
