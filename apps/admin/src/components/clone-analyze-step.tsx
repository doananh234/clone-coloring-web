"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCheck,
  faTriangleExclamation,
  faChevronLeft,
  faChevronRight,
  faFloppyDisk,
  faDroplet,
  faPaintbrushPencil,
} from "@fortawesome/pro-regular-svg-icons";
import type { CloneJob, CloneJobPage } from "@/lib/ai/clone-types";

interface CloneAnalyzeStepProps {
  job: CloneJob;
  onJobUpdate: (job: CloneJob) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CloneAnalyzeStep({ job, onJobUpdate, onNext, onBack }: CloneAnalyzeStepProps) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [editingRawData, setEditingRawData] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Poll for progress during analysis
  useEffect(() => {
    if (!analyzing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/clone/${job.id}`);
        const data = await res.json();
        if (data.success) {
          onJobUpdate(data.job);
          if (data.job.status === "analyzed" || data.job.status === "error") {
            setAnalyzing(false);
          }
        }
      } catch {
        // Polling failure is non-fatal
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [analyzing, job.id, onJobUpdate]);

  const startAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/clone/${job.id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        onJobUpdate(data.job);
      }
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const openPageReview = (page: CloneJobPage) => {
    setSelectedPage(page.pageNumber);
    if (page.rawData) {
      setEditingRawData(JSON.stringify(page.rawData, null, 2));
    } else if (page.error) {
      setEditingRawData(JSON.stringify({ error: page.error }, null, 2));
    } else {
      setEditingRawData("{}");
    }
  };

  const savePageEdit = async () => {
    if (selectedPage === null) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(editingRawData);
      const { reproductionPrompt: _, ...rawDataWithoutPrompt } = parsed;
      const res = await fetch(`/api/clone/${job.id}/pages/${selectedPage}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: rawDataWithoutPrompt }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh job
        const jobRes = await fetch(`/api/clone/${job.id}`);
        const jobData = await jobRes.json();
        if (jobData.success) onJobUpdate(jobData.job);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const navigatePage = useCallback(
    (direction: -1 | 1) => {
      if (selectedPage === null) return;
      const reviewablePages = job.pages.filter(
        (p) => p.status === "analyzed" || p.status === "error",
      );
      const idx = reviewablePages.findIndex((p) => p.pageNumber === selectedPage);
      const nextIdx = idx + direction;
      if (nextIdx >= 0 && nextIdx < reviewablePages.length) {
        const nextPage = reviewablePages[nextIdx];
        setSelectedPage(nextPage.pageNumber);
        if (nextPage.rawData) {
          setEditingRawData(JSON.stringify(nextPage.rawData, null, 2));
        } else if (nextPage.error) {
          setEditingRawData(JSON.stringify({ error: nextPage.error }, null, 2));
        } else {
          setEditingRawData("{}");
        }
      }
    },
    [selectedPage, job.pages],
  );

  const analyzedCount = job.pages.filter((p) => p.status === "analyzed").length;
  const errorCount = job.pages.filter((p) => p.status === "error").length;
  const allAnalyzed = analyzedCount === job.totalPages;
  const allProcessed = analyzedCount + errorCount === job.totalPages;
  const currentPage =
    selectedPage !== null ? job.pages.find((p) => p.pageNumber === selectedPage) : null;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <span>Analyzed {analyzedCount} of {job.totalPages} pages</span>
          {errorCount > 0 && (
            <span className="ml-2 text-red-500">({errorCount} failed)</span>
          )}
        </div>
        <div className="flex gap-2">
          {allAnalyzed && <AnalyzeCreateStyleMenu pages={job.pages} router={router} />}
          <button
            onClick={startAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {analyzing && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
            {analyzing
              ? `Analyzing...`
              : errorCount > 0
                ? `Retry Failed (${errorCount})`
                : allAnalyzed
                  ? "Re-analyze All"
                  : "Start Analysis"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${(analyzedCount / job.totalPages) * 100}%` }}
        />
      </div>

      {/* Page status grid OR detail view */}
      {selectedPage === null ? (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
          {job.pages.map((page) => (
            <button
              key={page.pageNumber}
              onClick={() => (page.status === "analyzed" || page.status === "error") && openPageReview(page)}
              disabled={page.status === "pending" || page.status === "analyzing"}
              className={`group relative aspect-[3/4] overflow-hidden rounded-md border-2 transition-all ${
                page.status === "analyzed"
                  ? "cursor-pointer border-green-500 hover:ring-1 hover:ring-green-500"
                  : page.status === "analyzing"
                    ? "border-primary"
                    : page.status === "error"
                      ? "cursor-pointer border-destructive hover:ring-1 hover:ring-destructive"
                      : "border-muted"
              }`}
            >
              <img
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {page.status === "analyzed" && (
                  <FontAwesomeIcon icon={faCheck} className="text-green-400" />
                )}
                {page.status === "analyzing" && (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                )}
                {page.status === "error" && (
                  <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-400" />
                )}
                {page.pageNumber}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedPage(null)}
              className="text-sm text-primary hover:underline"
            >
              Back to grid
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => navigatePage(-1)}
                className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                disabled={job.pages.findIndex((p) => p.pageNumber === selectedPage) === 0}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <span className="px-2 py-1 text-sm">Page {selectedPage}</span>
              <button
                onClick={() => navigatePage(1)}
                className="rounded-md border px-2 py-1 text-sm disabled:opacity-50"
                disabled={
                  job.pages.findIndex((p) => p.pageNumber === selectedPage) === job.pages.length - 1
                }
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-md border">
              <img
                src={currentPage?.imageUrl}
                alt={`Page ${selectedPage}`}
                className="w-full object-contain"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Scene Data</h4>
                <button
                  onClick={savePageEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <FontAwesomeIcon
                    icon={saving ? faSpinner : faFloppyDisk}
                    className={saving ? "animate-spin" : ""}
                  />
                  Save
                </button>
              </div>
              <textarea
                value={editingRawData}
                onChange={(e) => setEditingRawData(e.target.value)}
                className="h-[500px] w-full rounded-md border bg-muted/50 p-3 font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

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
          disabled={!allProcessed && !allAnalyzed}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {errorCount > 0 ? `Next (skip ${errorCount} errors) →` : "Next →"}
        </button>
      </div>
    </div>
  );
}

// --- Create Style from Page Image ---

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveStyleUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

function AnalyzeCreateStyleMenu({
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
    const resolvedUrl = resolveStyleUrl(imageUrl);
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
                    src={resolveStyleUrl(p.url)}
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
