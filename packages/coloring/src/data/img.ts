import { COLORING_IMG_BASE } from "./config";

/** Resolve an image field that may be an absolute URL or an R2 key ("/assets/..."). */
export function resolveImg(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!COLORING_IMG_BASE) return url;
  return `${COLORING_IMG_BASE.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

/** Host of our R2 custom domain — the only host Cloudflare Image Resizing serves. */
const CDN_HOST = (() => {
  try {
    return new URL(COLORING_IMG_BASE).host;
  } catch {
    return "";
  }
})();

export interface ThumbOptions {
  /** Target render width in device px. Pass ~2× the CSS size for retina crispness. */
  width?: number;
  /** JPEG/WebP quality 1-100 (default 75). */
  quality?: number;
  /** Cloudflare `fit` mode (default "cover"). */
  fit?: "cover" | "contain" | "scale-down" | "crop" | "pad";
}

/**
 * Like `resolveImg`, but requests a Cloudflare-resized/re-encoded variant via
 * `/cdn-cgi/image/` — dramatically smaller than the full-res original for grids
 * and thumbnails. Only images served from our own R2 custom domain
 * (`image.lagroups.org`) are rewritten; data URLs, the Diaflow CDN, and any
 * other host pass through untouched. Use full-res `resolveImg` for
 * lightbox/editor/zoom where quality matters.
 *
 * Requires "Image Transformations" enabled on the Cloudflare zone.
 */
export function thumbImg(
  url?: string | null,
  width = 400,
  opts: ThumbOptions = {},
): string | undefined {
  const resolved = resolveImg(url);
  if (!resolved || resolved.startsWith("data:")) return resolved;

  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    return resolved;
  }

  // Only our R2 custom domain supports transformations; never double-wrap.
  if (!CDN_HOST || parsed.host !== CDN_HOST) return resolved;
  if (parsed.pathname.startsWith("/cdn-cgi/image/")) return resolved;

  const params = [
    `width=${Math.round(width)}`,
    `quality=${opts.quality ?? 75}`,
    "format=auto",
    `fit=${opts.fit ?? "cover"}`,
  ].join(",");
  const path = parsed.pathname.replace(/^\//, "");
  return `${parsed.origin}/cdn-cgi/image/${params}/${path}${parsed.search}`;
}
