"use client";
import { useEffect } from "react";

/**
 * Ensures Google Fonts CSS is loaded in the browser for the given families.
 * Idempotent: adding the same family twice does nothing. Waits for
 * document.fonts.ready before returning so the canvas can draw with the
 * requested face on first render.
 */
export function useGoogleFonts(families: string[]): void {
  useEffect(() => {
    if (families.length === 0) return;
    const linkId = "cover-editor-google-fonts";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    const url = buildGoogleFontsUrl(families);
    if (link.href !== url) {
      link.href = url;
    }
  }, [families.join("|")]);
}

function buildGoogleFontsUrl(families: string[]): string {
  const parts = families
    .filter((f) => typeof f === "string" && f.length > 0)
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;700`);
  if (parts.length === 0) return "";
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}
