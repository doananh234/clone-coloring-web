import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_IMAGE_PROVIDERS } from "@vx/server-core/ai";
import {
  loadImageProviderConfig,
  saveImageProviderConfig,
  invalidateImageProviderConfigCache,
} from "@vx/db";

export const dynamic = "force-dynamic";

const KNOWN = new Set(AVAILABLE_IMAGE_PROVIDERS.map((p) => p.name));

/** The env-defined default chain (applies when no DB config is saved). */
function envDefault() {
  const primary = (process.env.IMAGE_PROVIDER || "azure").toLowerCase();
  const fallbacks = (process.env.IMAGE_FALLBACK_PROVIDERS ?? "diaflow,azure")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return { primary, fallbacks };
}

/**
 * GET — current image-gen provider chain config for the settings UI:
 *   available  : selectable providers (name + label)
 *   config     : the saved DB override (null if never set → env default applies)
 *   envDefault  : the env-defined chain, shown as the fallback baseline
 *   effective  : what the service will actually use right now (config ?? env)
 */
export async function GET() {
  try {
    const config = await loadImageProviderConfig();
    const env = envDefault();
    const effective = config ?? env;
    return NextResponse.json({
      success: true,
      available: AVAILABLE_IMAGE_PROVIDERS,
      config,
      envDefault: env,
      effective,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * PUT — save the provider chain order. Body: { primary, fallbacks }.
 * Validates every name against the known set and de-dupes (primary is never
 * repeated in fallbacks). Invalidates the cache so it takes effect within the
 * loader TTL across processes.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { primary?: unknown; fallbacks?: unknown };
    const primary = typeof body.primary === "string" ? body.primary.trim().toLowerCase() : "";
    if (!primary || !KNOWN.has(primary)) {
      return NextResponse.json({ error: `Invalid primary provider: ${String(body.primary)}` }, { status: 400 });
    }
    const rawFallbacks = Array.isArray(body.fallbacks) ? body.fallbacks : [];
    const bad = rawFallbacks.find((f) => typeof f !== "string" || !KNOWN.has(f.trim().toLowerCase()));
    if (bad !== undefined) {
      return NextResponse.json({ error: `Invalid fallback provider: ${String(bad)}` }, { status: 400 });
    }
    // De-dupe and drop the primary from the fallback list (it's already first).
    const fallbacks = [
      ...new Set(rawFallbacks.map((f) => (f as string).trim().toLowerCase())),
    ].filter((f) => f !== primary);

    const saved = await saveImageProviderConfig({ primary, fallbacks });
    invalidateImageProviderConfigCache();
    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
