import { COLORING_IMG_BASE } from "./config";

/** Resolve an image field that may be an absolute URL or an R2 key ("/assets/..."). */
export function resolveImg(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!COLORING_IMG_BASE) return url;
  return `${COLORING_IMG_BASE.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}
