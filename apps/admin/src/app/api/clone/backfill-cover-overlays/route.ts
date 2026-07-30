import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@vx/db";
import { visionAnalyzeJSON } from "@vx/server-core/ai/llm-provider";
import { FONT_CATALOG } from "@vx/server-core/text-overlay";
import { resolveR2Url } from "@vx/server-core/r2";
import {
  buildCoverDesignPrompt,
  type CoverDesignContext,
  type CoverDesignPack,
} from "@vx/server-core/ai/prompts/cover-design-prompt";

// TEMPORARY one-time backfill for old books created before the `elements`
// per-element style+layout extraction existed. New books already get this at
// create-book time via extract-source-style.ts (extractSourceStyleFromCover).
//
// Re-extracts the cover style+layout pack from each clone job's ORIGINAL
// source cover (job.pages[0].imageUrl — the cover WITH text) and writes it
// into book.data.coverStylePack, so the cover editor seeds each book's text
// layout/style from its own original cover instead of the system default.
//
// Relies on the same deploy-level/gateway auth as the rest of `/api` — no
// per-route auth here. dryRun defaults to true so callers must explicitly
// pass `dryRun: false` to write.

export const maxDuration = 300;

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

interface RequestBody {
  dryRun?: boolean;
  limit?: number;
  offset?: number;
  jobIds?: string[];
}

interface JobSummary {
  id: string;
  resultBookId: string | null;
  name: string;
  pages: unknown;
}

type BackfillStatus = "ok" | "skipped" | "error";

interface BackfillResult {
  jobId: string;
  bookId: string | null;
  status: BackfillStatus;
  reason?: string;
  error?: string;
  titlePresent?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const dryRun = body.dryRun ?? true;
    const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Math.max(0, body.offset ?? 0);
    const jobIds = body.jobIds;

    const where = {
      resultBookId: { not: null },
      ...(jobIds?.length ? { id: { in: jobIds } } : {}),
    };

    const total = await prisma.cloneJob.count({ where });
    const jobs = (await prisma.cloneJob.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
      select: { id: true, resultBookId: true, name: true, pages: true },
    })) as JobSummary[];

    const nextOffset = offset + jobs.length < total ? offset + jobs.length : null;

    if (dryRun) {
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
          hasSource: Boolean((j.pages as { imageUrl?: string }[] | null)?.[0]?.imageUrl),
        })),
      });
    }

    const results: BackfillResult[] = [];

    for (const j of jobs) {
      try {
        const pages = (j.pages as { imageUrl?: string }[] | null) ?? [];
        const sourceUrl = (pages[0]?.imageUrl || "").split("?")[0];
        if (!sourceUrl) {
          results.push({
            jobId: j.id,
            bookId: j.resultBookId,
            status: "skipped",
            reason: "no source image",
          });
          continue;
        }

        const book = await prisma.book.findUnique({
          where: { id: j.resultBookId as string },
          select: { title: true, subtitle: true, category: true, data: true },
        });
        if (!book) {
          results.push({
            jobId: j.id,
            bookId: j.resultBookId,
            status: "skipped",
            reason: "book missing",
          });
          continue;
        }

        const context: CoverDesignContext = {
          title: book.title || "Coloring Book",
          subtitle: book.subtitle || undefined,
          category: book.category || undefined,
        };
        const { systemPrompt, userPrompt } = buildCoverDesignPrompt(
          context,
          FONT_CATALOG.map((f) => f.family),
        );

        const pack = await visionAnalyzeJSON<CoverDesignPack>(
          resolveR2Url(sourceUrl),
          `${systemPrompt}\n\n${userPrompt}`,
          { maxTokens: 2000, temperature: 0.4 },
        );

        const curData = (book.data as Record<string, unknown> | null) ?? {};
        const mergedData = { ...curData, coverStylePack: pack };
        await prisma.book.update({
          where: { id: j.resultBookId as string },
          data: { data: mergedData as unknown as Prisma.InputJsonValue },
        });

        results.push({
          jobId: j.id,
          bookId: j.resultBookId,
          status: "ok",
          titlePresent: Boolean(pack?.elements?.title?.present),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ jobId: j.id, bookId: j.resultBookId, status: "error", error: message });
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "error").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    return NextResponse.json({
      dryRun: false,
      total,
      processed: results.length,
      ok,
      failed,
      skipped,
      nextOffset,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Prevent Next from caching this route
export const dynamic = "force-dynamic";
