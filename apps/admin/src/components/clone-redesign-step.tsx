"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faRotate,
  faSparkles,
  faChevronDown,
  faChevronUp,
  faDroplet,
  faPaintbrushPencil,
} from "@fortawesome/pro-regular-svg-icons";
import { notify } from "@vx/core-uikit/notifications";
import type { CloneJob, CloneJobPage } from "@/lib/ai/clone-types";

const CHANGE_OPTIONS = [
  { value: 30, label: "30% — Small changes" },
  { value: 50, label: "50% — Moderate redesign" },
] as const;

interface CloneRedesignStepProps {
  job: CloneJob;
  onJobUpdate: (job: CloneJob) => void;
  onNext: () => void;
  onBack: () => void;
}

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CloneRedesignStep({ job, onJobUpdate, onNext, onBack }: CloneRedesignStepProps) {
  const router = useRouter();
  const [changePercent, setChangePercent] = useState(30);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [pageStates, setPageStates] = useState<
    Record<number, { status: "idle" | "generating" | "done" | "error"; url?: string }>
  >(
    // Initialize from existing redesignedUrl if resuming
    Object.fromEntries(
      job.pages.map((p, i) => [
        i,
        p.redesignedUrl
          ? { status: "done" as const, url: p.redesignedUrl }
          : { status: "idle" as const },
      ]),
    ),
  );
  const [prompts, setPrompts] = useState<Record<number, string>>(
    Object.fromEntries(
      job.pages.map((p, i) => [i, p.redesignPrompt || p.rawData?.reproductionPrompt || ""]),
    ),
  );
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  const doneCount = Object.values(pageStates).filter((s) => s.status === "done").length;

  const redesignPage = useCallback(
    async (pageIndex: number) => {
      setPageStates((prev) => ({
        ...prev,
        [pageIndex]: { status: "generating" },
      }));

      try {
        const res = await fetch(`/api/clone/${job.id}/redesign-page`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageIndex,
            prompt: prompts[pageIndex] || undefined,
            changePercent,
          }),
        });
        const data = await res.json();

        if (data.success) {
          setPageStates((prev) => ({
            ...prev,
            [pageIndex]: { status: "done", url: data.url },
          }));
        } else {
          setPageStates((prev) => ({
            ...prev,
            [pageIndex]: { status: "error" },
          }));
          notify.error(data.error || `Page ${pageIndex + 1} failed`);
        }
      } catch {
        setPageStates((prev) => ({
          ...prev,
          [pageIndex]: { status: "error" },
        }));
      }
    },
    [job.id, prompts, changePercent],
  );

  async function handleGenerateAll() {
    setGeneratingAll(true);
    for (let i = 0; i < job.pages.length; i++) {
      if (pageStates[i]?.status !== "done") {
        await redesignPage(i);
      }
    }
    setGeneratingAll(false);
    notify.success("All pages redesigned!");
    // Refresh job data so parent has updated URLs
    try {
      const res = await fetch(`/api/clone/${job.id}`);
      const data = await res.json();
      if (data.success) onJobUpdate(data.job);
    } catch {
      /* best effort */
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Redesign each page using the original image + analyzed prompt. Edit prompts for small
        changes before generating.
      </p>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Change percent pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Change:</span>
          {CHANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChangePercent(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                changePercent === opt.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {opt.value}%
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          {doneCount}/{job.pages.length} done
        </span>

        <div className="ml-auto flex gap-2">
          {/* Create Style buttons */}
          <CreateStyleMenu pages={job.pages} router={router} />

          <button
            onClick={handleGenerateAll}
            disabled={generatingAll}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {generatingAll ? (
              <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="h-3 w-3" />
            )}
            {generatingAll ? "Redesigning..." : `Redesign All`}
          </button>
        </div>
      </div>

      {/* Page list */}
      <div className="space-y-2">
        {job.pages.map((page, i) => (
          <PageRedesignCard
            key={i}
            page={page}
            index={i}
            state={pageStates[i] || { status: "idle" }}
            prompt={prompts[i] || ""}
            onPromptChange={(val) => setPrompts((prev) => ({ ...prev, [i]: val }))}
            expanded={expandedPage === i}
            onToggleExpand={() => setExpandedPage(expandedPage === i ? null : i)}
            onRedesign={() => redesignPage(i)}
            disabled={generatingAll}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// --- Per-page card ---

function PageRedesignCard({
  page,
  index,
  state,
  prompt,
  onPromptChange,
  expanded,
  onToggleExpand,
  onRedesign,
  disabled,
}: {
  page: CloneJobPage;
  index: number;
  state: { status: string; url?: string };
  prompt: string;
  onPromptChange: (val: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onRedesign: () => void;
  disabled: boolean;
}) {
  const isGenerating = state.status === "generating";
  const isDone = state.status === "done";
  const isError = state.status === "error";

  return (
    <div className="rounded-lg border">
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        {/* Original thumbnail */}
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded border bg-muted">
          <img
            src={resolveUrl(page.imageUrl)}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>

        {/* Arrow + Redesigned thumbnail */}
        <span className="text-xs text-muted-foreground">→</span>
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded border bg-muted">
          {isDone && state.url ? (
            <img
              src={resolveUrl(state.url)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : isGenerating ? (
            <div className="flex h-full items-center justify-center">
              <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
              {isError ? "Error" : "—"}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">Page {index + 1}</p>
            {isDone && <span className="text-[10px] text-green-600">✓ Redesigned</span>}
            {isError && <span className="text-[10px] text-red-500">✗ Failed</span>}
            {isGenerating && <span className="text-[10px] text-blue-500">Generating…</span>}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
            {page.rawData?.scene?.description || "No scene data"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded p-1.5 hover:bg-muted"
            title="Edit prompt"
          >
            <FontAwesomeIcon
              icon={expanded ? faChevronUp : faChevronDown}
              className="h-3 w-3 text-muted-foreground"
            />
          </button>
          <button
            type="button"
            onClick={onRedesign}
            disabled={disabled || isGenerating}
            className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
            title="Redesign"
          >
            <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded prompt editor */}
      {expanded && (
        <div className="border-t px-3 py-2.5">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Prompt (edit for small changes)
          </label>
          <textarea
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            rows={4}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={isGenerating}
          />
        </div>
      )}
    </div>
  );
}

// --- Create Style Menu ---

function CreateStyleMenu({
  pages,
  router,
}: {
  pages: CloneJobPage[];
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<"coloring" | "art" | null>(null);

  const pageImages = pages
    .filter((p) => p.imageUrl)
    .map((p, i) => ({ index: i, url: p.imageUrl, pageNumber: p.pageNumber }));

  function handleSelectPage(imageUrl: string, type: "coloring" | "art") {
    const resolvedUrl = resolveUrl(imageUrl);
    // Navigate to the create page with the image URL as a query param
    if (type === "coloring") {
      router.push(`/coloring-styles/new?referenceImage=${encodeURIComponent(resolvedUrl)}`);
    } else {
      router.push(`/art-styles/new?referenceImage=${encodeURIComponent(resolvedUrl)}`);
    }
    setOpen(false);
    setSelectingFor(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        <FontAwesomeIcon icon={faPaintbrushPencil} className="h-3 w-3" />
        Create Style
      </button>

      {open && !selectingFor && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={() => setSelectingFor("coloring")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
            >
              <FontAwesomeIcon icon={faDroplet} className="h-3 w-3 text-purple-500" />
              Coloring Style
            </button>
            <button
              type="button"
              onClick={() => setSelectingFor("art")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
            >
              <FontAwesomeIcon icon={faPaintbrushPencil} className="h-3 w-3 text-amber-500" />
              Art Style
            </button>
          </div>
        </>
      )}

      {open && selectingFor && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSelectingFor(null); }} />
          <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border bg-popover p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium">
              Select a page for {selectingFor === "coloring" ? "Coloring" : "Art"} Style
            </p>
            <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto">
              {pageImages.map((p) => (
                <button
                  key={p.index}
                  type="button"
                  onClick={() => handleSelectPage(p.url, selectingFor)}
                  className="overflow-hidden rounded border hover:ring-2 hover:ring-primary"
                >
                  <img
                    src={resolveUrl(p.url)}
                    alt={`Page ${p.pageNumber}`}
                    className="aspect-[3/4] w-full object-cover"
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSelectingFor(null)}
              className="mt-2 text-[11px] text-muted-foreground hover:underline"
            >
              ← Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
