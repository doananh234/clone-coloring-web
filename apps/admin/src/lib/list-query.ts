/**
 * Shared list handler for the simple entity endpoints
 * (characters, locations, art-styles, coloring-styles).
 *
 * Two modes, chosen by query params:
 *   - No `page`/`limit`      → returns every (projected) row: { data }.
 *                              Preserves the pre-pagination contract used by the
 *                              current FE (useEntityList sends no params yet).
 *   - `page`/`limit` present → returns a paginated slice: { data, meta }.
 *
 * The `select` projection is the real performance win: it drops the heavy JSON
 * descriptor columns (visualDna, lineWork, atmosphere, medium, …) that bloated
 * every list payload. Detail/edit screens fetch the full row via the `[id]`
 * route, so the list never needs those columns.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma delegate args are
   model-specific; the runners are typed at each call site instead. */
import { NextRequest, NextResponse } from "next/server";
import { ci } from "@vx/db";

export interface EntityListRunners<T> {
  findMany: (args: any) => Promise<T[]>;
  count: (args: any) => Promise<number>;
}

export interface EntityListOptions {
  /** Prisma `select` — keep ONLY light columns the list card needs. */
  select: Record<string, boolean>;
  /** String columns OR-matched (case-insensitive) against the `q`/`search` param. */
  searchFields?: string[];
  /** Defaults to `{ name: "asc" }`. */
  orderBy?: any;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

export async function listEntity<T>(
  req: NextRequest,
  runners: EntityListRunners<T>,
  opts: EntityListOptions,
): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");
  const q = (searchParams.get("q") ?? searchParams.get("search") ?? "").trim();
  const orderBy = opts.orderBy ?? { name: "asc" };

  const where =
    q && opts.searchFields?.length
      ? {
          OR: opts.searchFields.map((f) => ({
            [f]: ci(q),
          })),
        }
      : undefined;

  // Backward-compatible path: no pagination params → return all projected rows.
  if (!pageRaw && !limitRaw) {
    const data = await runners.findMany({ where, orderBy, select: opts.select });
    return NextResponse.json({ data });
  }

  const limit = Math.min(Math.max(Number(limitRaw) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(Number(pageRaw) || 1, 1);
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    runners.findMany({ where, orderBy, select: opts.select, skip, take: limit }),
    runners.count({ where }),
  ]);

  return NextResponse.json({
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
}
