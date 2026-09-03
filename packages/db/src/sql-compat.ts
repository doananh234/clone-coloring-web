/**
 * Cross-provider query helpers.
 *
 * The app runs on PostgreSQL in prod but SQLite for local dev. A handful of
 * Prisma query features are Postgres-only or have different SQLite syntax:
 *   - `mode: "insensitive"` on string filters (Postgres/MySQL only)
 *   - JSON `path` filters: Postgres takes a key array, SQLite a JSONPath string
 *
 * These helpers emit the right shape for whichever provider DATABASE_URL points
 * at, so shared code stays provider-agnostic and prod behavior is preserved.
 */

/** Active datasource provider, inferred from DATABASE_URL (`file:` → sqlite). */
export function dbProvider(): "sqlite" | "postgres" {
  return process.env.DATABASE_URL?.startsWith("file:") ? "sqlite" : "postgres";
}

export function isSqlite(): boolean {
  return dbProvider() === "sqlite";
}

/**
 * Case-insensitive `contains` filter.
 *
 * Postgres needs `mode: "insensitive"`; SQLite's `LIKE` is already
 * case-insensitive for ASCII, so we omit `mode` there (it isn't a valid key on
 * the SQLite-generated client). Return type is the SQLite-compatible shape so it
 * type-checks against both generated clients; `mode` is added at runtime only
 * for Postgres.
 */
export function ci(value: string): { contains: string } {
  const filter: { contains: string; mode?: "insensitive" } = { contains: value };
  if (!isSqlite()) filter.mode = "insensitive";
  return filter as { contains: string };
}

/**
 * Case-insensitive `equals` filter — same provider handling as {@link ci}.
 * NOTE: SQLite's default `=` is case-SENSITIVE; unlike `LIKE`, omitting `mode`
 * here yields exact-case matching on SQLite. Acceptable for local dev.
 */
export function cieq(value: string): { equals: string } {
  const filter: { equals: string; mode?: "insensitive" } = { equals: value };
  if (!isSqlite()) filter.mode = "insensitive";
  return filter as { equals: string };
}

/**
 * JSON key-path for a Prisma `path` filter.
 * Postgres wants a key array (`["a","b"]`); SQLite wants a JSONPath string
 * (`"$.a.b"`). Returns `unknown`-as-`any` because the two generated clients type
 * `path` incompatibly (string[] vs string).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonPath(keys: string[]): any {
  return isSqlite() ? `$.${keys.join(".")}` : keys;
}
