/**
 * Google Fonts TTF loader with /tmp caching.
 * Downloads .ttf files from Google Fonts CDN and caches locally
 * for registration with @napi-rs/canvas GlobalFonts.
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const CACHE_DIR = join(tmpdir(), "fonts");
const GOOGLE_FONTS_CSS_URL = "https://fonts.googleapis.com/css2";

/**
 * User-Agent for Google Fonts CSS request.
 * Older Chrome UAs get .ttf, newer may get .woff2 — we handle both.
 */
const FONT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36";

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(family: string, weight: number): string {
  return family.replace(/\s+/g, "-").toLowerCase() + `-${weight}`;
}

/**
 * Fetch a Google Font TTF and return the local file path.
 * Caches in /tmp/fonts/ so subsequent calls skip the download.
 */
export async function fetchGoogleFont(
  family: string,
  weight: number = 400,
): Promise<string> {
  ensureCacheDir();

  const key = cacheKey(family, weight);
  // Check both .ttf and .woff2 cache
  const ttfPath = join(CACHE_DIR, `${key}.ttf`);
  const woff2Path = join(CACHE_DIR, `${key}.woff2`);

  if (existsSync(ttfPath)) return ttfPath;
  if (existsSync(woff2Path)) return woff2Path;



  // Step 1: Fetch CSS from Google Fonts to extract the .ttf URL
  // Try requested weight first, fallback to default for single-weight fonts (e.g. Fredoka One)
  const cssUrlWithWeight = `${GOOGLE_FONTS_CSS_URL}?family=${encodeURIComponent(family)}:wght@${weight}`;
  const cssUrlDefault = `${GOOGLE_FONTS_CSS_URL}?family=${encodeURIComponent(family)}`;

  let cssRes = await fetch(cssUrlWithWeight, {
    headers: { "User-Agent": FONT_USER_AGENT },
  });

  if (!cssRes.ok) {
    cssRes = await fetch(cssUrlDefault, {
      headers: { "User-Agent": FONT_USER_AGENT },
    });
  }

  if (!cssRes.ok) {
    throw new Error(`Google Fonts CSS fetch failed (${cssRes.status}): ${family}`);
  }

  const cssText = await cssRes.text();

  // Step 2: Extract font URL from CSS (.ttf preferred, .woff2 fallback)
  const ttfMatch = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/);
  const woff2Match = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
  const fontUrl = ttfMatch?.[1] || woff2Match?.[1];

  if (!fontUrl) {
    throw new Error(`No font URL found in Google Fonts CSS for: ${family}`);
  }

  const ext = fontUrl.endsWith(".woff2") ? ".woff2" : ".ttf";
  const localPath = join(CACHE_DIR, `${key}${ext}`);

  // Step 3: Download the font file
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) {
    throw new Error(`Font download failed (${fontRes.status}): ${family}`);
  }

  const fontBuffer = Buffer.from(await fontRes.arrayBuffer());
  writeFileSync(localPath, fontBuffer);

  return localPath;
}
