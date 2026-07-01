/**
 * Types for the text overlay system.
 * Used by both client (modal preview) and server (canvas rendering).
 */

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
