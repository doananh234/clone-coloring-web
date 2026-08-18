import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin image proxy for the cover editor's Fabric canvas.
 *
 * The browser's `fabric.Image.fromURL` needs CORS-allowed sources to draw
 * onto a canvas without tainting it. R2's default CORS blocks the admin
 * origin, so we fetch server-side and stream back with permissive headers.
 *
 * Allow-list is minimal but broad enough for our known asset hosts (R2
 * public bucket + Diaflow CDN). Reject everything else to prevent using
 * the admin as an open proxy.
 */

// Hardcoded suffixes so the proxy still works even if env vars are unset.
const DEFAULT_ALLOWED_SUFFIXES = [
  ".r2.dev",
  ".r2.cloudflarestorage.com",
  ".cdn.diaflow.io",
  "cdn.diaflow.io",
];

function getAllowedHosts(): { suffixes: string[]; exact: string[] } {
  const suffixes = [...DEFAULT_ALLOWED_SUFFIXES];
  const exact: string[] = [];
  const r2Base =
    process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
  if (r2Base) {
    try {
      const u = new URL(r2Base);
      exact.push(u.hostname);
    } catch {
      // ignore malformed env
    }
  }
  return { suffixes, exact };
}

function isAllowedHost(hostname: string): boolean {
  const { suffixes, exact } = getAllowedHosts();
  if (exact.includes(hostname)) return true;
  return suffixes.some((suffix) =>
    suffix.startsWith(".") ? hostname.endsWith(suffix) : hostname === suffix,
  );
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "url query param is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "only http(s) urls allowed" }, { status: 400 });
  }

  if (!isAllowedHost(parsed.hostname)) {
    return NextResponse.json(
      { error: `host not allowed: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream fetch failed (${upstream.status})` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    // Stream the upstream body straight through instead of buffering the whole
    // image into server memory (concurrent proxied requests otherwise each hold
    // a full image in RAM on the small prod host). Forward the upstream cache
    // header when present so downstream/CDN caching is preserved.
    const cacheControl =
      upstream.headers.get("cache-control") ?? "public, max-age=3600, immutable";

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `upstream fetch error: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";
