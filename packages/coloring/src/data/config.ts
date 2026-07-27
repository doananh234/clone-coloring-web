/**
 * Where the /coloring surface reads data + images from.
 *
 * Defaults point at the live deployment (via the same-origin `/coloring-api`
 * proxy rewrite in next.config.ts) so the new UI shows real data even when the
 * local Postgres is unavailable. To run against the local app's own DB instead,
 * set NEXT_PUBLIC_COLORING_API_BASE=/api and NEXT_PUBLIC_COLORING_IMG_BASE to
 * your local R2 base.
 */
export const COLORING_API_BASE = process.env.NEXT_PUBLIC_COLORING_API_BASE || "/coloring-api";

export const COLORING_IMG_BASE =
  process.env.NEXT_PUBLIC_COLORING_IMG_BASE ||
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
  "https://image.lagroups.org";

/**
 * Whether write forms PUT to the real API. DEFAULT false → writes stay in the
 * local sandbox (localStorage). Only set NEXT_PUBLIC_COLORING_WRITE=1 when the
 * upstream (COLORING_API_UPSTREAM) points at a SAFE staging DB — never prod.
 */
export const COLORING_WRITE_ENABLED = process.env.NEXT_PUBLIC_COLORING_WRITE === "1";

