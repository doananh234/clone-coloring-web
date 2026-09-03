import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  __prismaPoolerPatched?: boolean;
};

/**
 * Append `pgbouncer=true` (and cap connection_limit) when not already set.
 *
 * Prevents two symptoms of Prisma + transaction-mode pooler
 * (PgBouncer / Supabase / Neon):
 *   - `42P05: prepared statement "s1" already exists`
 *   - `26000: prepared statement "s28" does not exist`
 *
 * With `pgbouncer=true` Prisma's Rust engine skips prepared-statement caching,
 * which is safe on both pooled and direct connections. Must mutate
 * `process.env.DATABASE_URL` BEFORE `new PrismaClient(...)` — the `datasourceUrl`
 * runtime option does not always propagate query params to the engine.
 */
function patchDatabaseUrl(): void {
  if (globalForPrisma.__prismaPoolerPatched) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;
  try {
    const u = new URL(url);
    let changed = false;
    if (!u.searchParams.has("pgbouncer")) {
      u.searchParams.set("pgbouncer", "true");
      changed = true;
    }
    if (!u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "1");
      changed = true;
    }
    if (changed) process.env.DATABASE_URL = u.toString();
    globalForPrisma.__prismaPoolerPatched = true;
  } catch {
    // Leave URL unchanged if it doesn't parse — Prisma will surface the real error.
  }
}

patchDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
export {
  syncCloneJobStatusCounts,
  readCloneJobStatusCounts,
} from "./clone-status-counts";
export { dbProvider, isSqlite, ci, cieq, jsonPath } from "./sql-compat";
