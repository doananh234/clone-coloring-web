import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { JobContext } from "@vx/clone-core/job-context";
import { stepGenerateCover } from "@vx/clone-core/steps";
import { generateCoverDeps } from "@vx/server-core/cover-generation/clone-cover-deps";

// Long-running hint for self-hosted Next: cover regeneration is sequential and
// each job runs several AI calls (style extract → colorize → AI cover), so a
// batch can take minutes. Harmless on self-hosted infra.
export const maxDuration = 300;

// AUTH: this write endpoint intentionally has NO per-route auth — it relies on
// the same deployment/gateway auth that fronts every other apps/admin/src/app/
// api/* route (brands, coloring-styles, clone/*). Consistent with the rest of
// the admin API surface.
//
// SAFETY: `dryRun` DEFAULTS TRUE so an accidental / unparameterized POST never
// spends AI budget. Callers MUST explicitly pass `dryRun: false` to actually
// regenerate covers.

const MAX_LIMIT = 50;
const MIN_LIMIT = 1;
const DEFAULT_LIMIT = 10;

interface RegenerateBody {
  limit?: number;
  offset?: number;
  jobIds?: string[];
  dryRun?: boolean;
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n));
}

function clampOffset(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.max(0, n);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as RegenerateBody;

    const limit = clampLimit(body.limit);
    const offset = clampOffset(body.offset);
    const dryRun = body.dryRun !== false; // default true
    const jobIds = Array.isArray(body.jobIds) ? body.jobIds : undefined;

    // Only jobs that actually produced a book can have a cover regenerated.
    const where = {
      resultBookId: { not: null },
      ...(jobIds && jobIds.length ? { id: { in: jobIds } } : {}),
    };

    const total = await prisma.cloneJob.count({ where });
    const jobs = await prisma.cloneJob.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
      select: { id: true, resultBookId: true, name: true },
    });

    const nextOffset =
      offset + jobs.length < total ? offset + jobs.length : null;

    if (dryRun) {
      // No AI calls — just report what WOULD be processed.
      return NextResponse.json({
        dryRun: true,
        total,
        offset,
        count: jobs.length,
        nextOffset,
        jobs: jobs.map((j) => ({
          jobId: j.id,
          bookId: j.resultBookId,
          name: j.name,
        })),
      });
    }

    // Real run — process SEQUENTIALLY to avoid hammering the AI API. One job's
    // failure is captured per-item and does NOT abort the batch.
    const results: Array<{
      jobId: string;
      bookId: string | null;
      status: "ok" | "error";
      error?: string;
    }> = [];

    for (const j of jobs) {
      try {
        const ctx = await JobContext.load(prisma, j.id);
        await stepGenerateCover(ctx, prisma, generateCoverDeps);
        results.push({ jobId: j.id, bookId: j.resultBookId, status: "ok" });
      } catch (e) {
        results.push({
          jobId: j.id,
          bookId: j.resultBookId,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      dryRun: false,
      total,
      processed: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      failed: results.filter((r) => r.status === "error").length,
      nextOffset,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
