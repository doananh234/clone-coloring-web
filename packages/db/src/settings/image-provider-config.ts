import { prisma } from "../index";

/**
 * Runtime-editable image-gen provider chain, persisted in AppSetting so the
 * order can be changed from the admin UI without a redeploy. Both admin (via the
 * settings API + a resolver registered in instrumentation) and worker (resolver
 * registered at boot) read it through loadImageProviderConfig().
 *
 * `primary` = the provider tried first; `fallbacks` = the ordered chain tried
 * next. server-core merges this over the IMAGE_PROVIDER / IMAGE_FALLBACK_PROVIDERS
 * env defaults (a null/empty config → env defaults apply).
 */
export type ImageProviderConfig = {
  primary: string;
  fallbacks: string[];
};

const SETTING_KEY = "imageProviderConfig";
const CACHE_TTL_MS = 15_000;

let cache: { value: ImageProviderConfig | null; at: number } | null = null;

function isValidConfig(v: unknown): v is ImageProviderConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.primary === "string" && Array.isArray(c.fallbacks) && c.fallbacks.every((f) => typeof f === "string");
}

/**
 * Read the saved config (null if never set → callers fall back to env). Cached
 * for CACHE_TTL_MS so hot image paths don't hit the DB on every call; a save
 * invalidates the cache so changes propagate within the TTL across processes.
 */
export async function loadImageProviderConfig(): Promise<ImageProviderConfig | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let value: ImageProviderConfig | null = null;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    if (row && isValidConfig(row.value)) value = row.value as ImageProviderConfig;
  } catch {
    // Table missing (pre-migration) or DB blip → treat as unset (env defaults).
    value = null;
  }
  cache = { value, at: Date.now() };
  return value;
}

/** Upsert the config and invalidate the in-process cache. */
export async function saveImageProviderConfig(config: ImageProviderConfig): Promise<ImageProviderConfig> {
  const clean: ImageProviderConfig = {
    primary: config.primary.trim().toLowerCase(),
    fallbacks: config.fallbacks.map((f) => f.trim().toLowerCase()).filter(Boolean),
  };
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: clean },
    update: { value: clean },
  });
  cache = { value: clean, at: Date.now() };
  return clean;
}

/** Force the next loadImageProviderConfig() to re-read from the DB. */
export function invalidateImageProviderConfigCache(): void {
  cache = null;
}
