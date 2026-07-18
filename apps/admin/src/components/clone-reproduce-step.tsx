"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRestGetAll } from "@vx/core-uikit/api";
import { Combobox, Label, Input } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faSparkles,
  faRotate,
  faRotateLeft,
  faBook,
  faCameraRotate,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/pro-regular-svg-icons";
import { notify } from "@vx/core-uikit/notifications";
import type { CloneJob } from "@vx/server-core/ai/clone-types";
import type { CategoryEntity } from "@/crud/categories";
import { PagePreviewPopover, usePreviewHover } from "./page-preview-popover";

interface CloneReproduceStepProps {
  job: CloneJob;
  onBack: () => void;
  onNext?: () => void;
}

type CandidateKind = "regen" | "angle";

type PageCandidates = {
  regen?: string;
  angle?: string;
  angleView?: string;
};

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CloneReproduceStep({ job, onBack, onNext }: CloneReproduceStepProps) {
  const router = useRouter();
  const [bookId, setBookId] = useState<string | null>(job.bookId || null);
  const [creating, setCreating] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  // Book metadata
  const [title, setTitle] = useState(job.bookData?.title || job.name || "");
  const [subtitle, setSubtitle] = useState(job.bookData?.subtitle || "");
  const [description, setDescription] = useState(job.bookData?.description || "");
  const [categoryId, setCategoryId] = useState(job.bookData?.categoryId || "");
  const [category, setCategory] = useState(job.bookData?.category || "");
  const [badge, setBadge] = useState("");
  const [price, setPrice] = useState("");

  const { data: categories } = useRestGetAll<CategoryEntity>({
    entityName: "categoriesForClone",
    url: "/api/categories",
    page: 1,
    limit: 100,
  });

  // Per-page candidates: regen / new-angle results generated but not applied.
  // Seeded from job.pages (persisted fields), overlaid by this session's runs.
  const [candidates, setCandidates] = useState<Record<number, PageCandidates>>({});
  // Local override of the applied result (reproducedUrl) after an apply call.
  const [applied, setApplied] = useState<Record<number, string>>({});
  // Generation status per `${pageIndex}:${kind}` slot.
  const [genStatus, setGenStatus] = useState<Record<string, "generating" | "error">>({});
  const [applying, setApplying] = useState<Record<number, boolean>>({});
  const [generatingAll, setGeneratingAll] = useState(false);

  // Current applied result: session apply > persisted apply > redesigned > original
  function currentUrl(index: number): string {
    const page = job.pages[index];
    return applied[index] || page?.reproducedUrl || page?.redesignedUrl || page?.imageUrl || "";
  }

  function candidatesFor(index: number): PageCandidates {
    const page = job.pages[index];
    return {
      regen: candidates[index]?.regen ?? page?.regenCandidateUrl,
      angle: candidates[index]?.angle ?? page?.angleCandidateUrl,
      angleView: candidates[index]?.angleView ?? page?.angleCandidateView,
    };
  }

  // Always true — every page has at least the original image
  const hasAnyResult = job.pages.length > 0;

  const regeneratePage = useCallback(
    async (pageIndex: number, kind: CandidateKind, apply = false) => {
      const slot = `${pageIndex}:${kind}`;
      setGenStatus((prev) => ({ ...prev, [slot]: "generating" }));
      try {
        const res = await fetch(`/api/clone/${job.id}/reproduce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIndex, newAngle: kind === "angle", apply }),
        });
        const data = await res.json();
        const result = data.results?.[0];
        if (data.success && result?.success) {
          // Merge onto prev only — candidatesFor() falls back to the
          // persisted page fields at render time for anything not set here.
          setCandidates((prev) => ({
            ...prev,
            [pageIndex]: {
              ...prev[pageIndex],
              ...(kind === "regen"
                ? { regen: result.url }
                : { angle: result.url, angleView: result.cameraView }),
            },
          }));
          if (apply) setApplied((prev) => ({ ...prev, [pageIndex]: result.url }));
          setGenStatus((prev) => {
            const next = { ...prev };
            delete next[slot];
            return next;
          });
          if (!bookId && data.bookId) setBookId(data.bookId);
          if (result.cameraView) {
            notify.success(`New angle ready: ${result.cameraView} view`);
          }
        } else {
          setGenStatus((prev) => ({ ...prev, [slot]: "error" }));
          notify.error(result?.error || data.error || "Generation failed");
        }
      } catch {
        setGenStatus((prev) => ({ ...prev, [slot]: "error" }));
      }
    },
    [job.id, bookId],
  );

  const applyCandidate = useCallback(
    async (pageIndex: number, kind: CandidateKind | "redesign") => {
      setApplying((prev) => ({ ...prev, [pageIndex]: true }));
      try {
        const res = await fetch(`/api/clone/${job.id}/apply-candidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIndex, kind }),
        });
        const data = await res.json();
        if (data.success) {
          setApplied((prev) => ({ ...prev, [pageIndex]: data.url }));
          notify.success(
            kind === "redesign" ? "Reverted to redesigned result" : "Candidate applied",
          );
        } else {
          notify.error(data.error || "Failed to apply");
        }
      } catch {
        notify.error("Failed to apply");
      } finally {
        setApplying((prev) => ({ ...prev, [pageIndex]: false }));
      }
    },
    [job.id],
  );

  async function handleRegenerateAll() {
    setGeneratingAll(true);
    for (let i = 0; i < job.pages.length; i++) {
      // Regenerate All keeps the old behavior: generate + apply immediately.
      await regeneratePage(i, "regen", true);
    }
    setGeneratingAll(false);
    notify.success("All pages regenerated!");
  }

  async function handleCreateBook() {
    setCreating(true);
    try {
      const res = await fetch(`/api/clone/${job.id}/create-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: true,
          useRedesigned: true,
          metadata: {
            title: title || job.name || "Untitled",
            subtitle,
            description,
            categoryId: categoryId || undefined,
            category: category || undefined,
            badge: badge || undefined,
            price: price || undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookId(data.bookId);
        notify.success("Book created!");
      } else {
        notify.error(data.error || "Failed to create book");
      }
    } catch {
      notify.error("Failed to create book");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Book created banner */}
      {bookId && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950/30">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Book created
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/books/${bookId}`)}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            >
              <FontAwesomeIcon icon={faBook} className="h-3 w-3" />
              View Book
            </button>
            <button
              onClick={handleCreateBook}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {creating && <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />}
              Re-create
            </button>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Review the results for each page. Redesigned images are shown as the initial result.
        You can regenerate any page with AI, or create the book directly from current results.
      </p>

      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {job.pages.length} pages
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleRegenerateAll}
            disabled={generatingAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {generatingAll ? (
              <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="h-3 w-3" />
            )}
            {generatingAll ? "Regenerating..." : "Regenerate All with AI"}
          </button>
          {!bookId && hasAnyResult && (
            <button
              onClick={handleCreateBook}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {creating ? (
                <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
              ) : (
                <FontAwesomeIcon icon={faBook} className="h-3 w-3" />
              )}
              {creating ? "Creating..." : "Create Book"}
            </button>
          )}
        </div>
      </div>

      {/* Book Metadata */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setMetaOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50"
        >
          <span>Book Info {title && `— ${title}`}</span>
          <FontAwesomeIcon
            icon={metaOpen ? faChevronUp : faChevronDown}
            className="h-3 w-3 text-muted-foreground"
          />
        </button>
        {metaOpen && (
          <div className="space-y-3 border-t px-4 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book title" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subtitle</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle" className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Book description"
                rows={2}
                className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Combobox
                  options={(categories || []).map((cat) => ({
                    value: cat.id,
                    label: cat.displayName,
                  }))}
                  value={categoryId}
                  onValueChange={(val) => {
                    setCategoryId(val);
                    const cat = (categories || []).find((c) => c.id === val);
                    if (cat) setCategory(cat.name || cat.displayName);
                  }}
                  placeholder="Select"
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Badge</Label>
                <Combobox
                  options={[
                    { value: "NEW", label: "NEW" },
                    { value: "HOT", label: "HOT" },
                    { value: "SALE", label: "SALE" },
                  ]}
                  value={badge}
                  onValueChange={setBadge}
                  placeholder="None"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price</Label>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="7.99" className="h-8 text-xs" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Page grid */}
      <div className="space-y-2">
        {job.pages.map((page, i) => {
          const url = currentUrl(i);
          const isRegenerated = !!applied[i] || !!page.reproducedUrl;
          const isRedesigned = !isRegenerated && !!page.redesignedUrl;

          return (
            <ReproducePageRow
              key={i}
              page={page}
              index={i}
              currentUrl={url}
              cands={candidatesFor(i)}
              regenStatus={genStatus[`${i}:regen`]}
              angleStatus={genStatus[`${i}:angle`]}
              isRedesigned={isRedesigned}
              isRegenerated={isRegenerated}
              isApplying={!!applying[i]}
              disabled={generatingAll}
              onRegenerate={(kind) => regeneratePage(i, kind)}
              onApply={(kind) => applyCandidate(i, kind)}
            />
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back
        </button>
        <div className="flex gap-2">
          {bookId && (
            <button
              onClick={() => router.push(`/books/${bookId}`)}
              className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5" />
              View Book
            </button>
          )}
          <button
            onClick={handleCreateBook}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {creating ? (
              <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faBook} className="h-3.5 w-3.5" />
            )}
            {bookId ? "Re-create Book" : "Create Book"}
          </button>
          {onNext && (
            <button
              onClick={onNext}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Extract Library →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Per-page row with hover preview ---

function ReproducePageRow({
  page,
  index,
  currentUrl,
  cands,
  regenStatus,
  angleStatus,
  isRedesigned,
  isRegenerated,
  isApplying,
  disabled,
  onRegenerate,
  onApply,
}: {
  page: CloneJob["pages"][number];
  index: number;
  currentUrl: string;
  cands: PageCandidates;
  regenStatus?: "generating" | "error";
  angleStatus?: "generating" | "error";
  isRedesigned: boolean;
  isRegenerated: boolean;
  isApplying: boolean;
  disabled: boolean;
  onRegenerate: (kind: CandidateKind) => void;
  onApply: (kind: CandidateKind | "redesign") => void;
}) {
  const { anchorRef, open: previewOpen, position: previewPos, openPreview, closePreview } =
    usePreviewHover();

  const generating = regenStatus === "generating" || angleStatus === "generating";
  const hasError = regenStatus === "error" || angleStatus === "error";

  const resultLabel = isRegenerated ? "Regenerated" : isRedesigned ? "Redesigned" : "—";

  const badge = generating
    ? { text: "Generating…", className: "text-blue-600" }
    : isRegenerated
      ? { text: "Regenerated", className: "text-green-600" }
      : isRedesigned
        ? { text: "Redesigned", className: "text-amber-600" }
        : hasError
          ? { text: "Failed", className: "text-red-500" }
          : { text: "Pending", className: "text-muted-foreground" };

  // A candidate slot is "active" when the current result points at it.
  const isActive = (url?: string) => !!url && url === currentUrl;

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {/* Hover anchor wraps both thumbnails + arrow */}
      <div
        ref={anchorRef}
        className="flex items-center gap-3 cursor-zoom-in"
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
      >
        {/* Original thumbnail */}
        <div className="shrink-0 text-center">
          <div className="h-14 w-10 overflow-hidden rounded border bg-muted">
            <img src={resolveUrl(page.imageUrl)} alt="" className="h-full w-full object-cover" />
          </div>
          <p className="mt-0.5 text-[8px] text-muted-foreground">Original</p>
        </div>

        <span className="text-[10px] text-muted-foreground">→</span>

        {/* Current result */}
        <div className="shrink-0 text-center">
          <div
            className={`h-14 w-10 overflow-hidden rounded border bg-muted ${
              isRedesigned ? "border-amber-300" : isRegenerated ? "border-green-400" : ""
            }`}
          >
            {currentUrl ? (
              <img src={resolveUrl(currentUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-[8px] text-muted-foreground">
                Pending
              </div>
            )}
          </div>
          <p
            className={`mt-0.5 text-[8px] ${
              isRegenerated
                ? "text-green-600"
                : isRedesigned
                  ? "text-amber-600"
                  : "text-muted-foreground"
            }`}
          >
            {resultLabel}
          </p>
        </div>
      </div>

      {/* Candidates: regen + new angle, each with a Use button */}
      <div className="flex shrink-0 items-start gap-2">
        <CandidateSlot
          label="Regen"
          url={cands.regen}
          status={regenStatus}
          active={isActive(cands.regen)}
          applying={isApplying}
          onUse={() => onApply("regen")}
        />
        <CandidateSlot
          label={cands.angleView ? `Angle: ${cands.angleView}` : "Angle"}
          url={cands.angle}
          status={angleStatus}
          active={isActive(cands.angle)}
          applying={isApplying}
          onUse={() => onApply("angle")}
        />
      </div>

      {previewOpen && previewPos && (
        <PagePreviewPopover
          title={`Page ${index + 1}`}
          badge={badge}
          leftLabel="Original"
          leftUrl={resolveUrl(page.imageUrl)}
          rightLabel="Current Result"
          rightSlot={
            currentUrl ? (
              <img
                src={resolveUrl(currentUrl)}
                alt={`Page ${index + 1} result`}
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : hasError ? (
              <span className="text-xs text-red-500">Failed — try again</span>
            ) : (
              <span className="text-xs text-muted-foreground">No result yet</span>
            )
          }
          top={previewPos.top}
          left={previewPos.left}
          onMouseEnter={openPreview}
          onMouseLeave={closePreview}
        />
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">Page {index + 1}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
          {page.rawData?.scene?.description || page.rawData?.reproductionPrompt?.slice(0, 80) || "—"}
        </p>
      </div>

      {/* Regenerate buttons */}
      <div className="flex shrink-0 flex-col gap-1">
        <button
          className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
          title="Generate regen candidate"
          onClick={() => onRegenerate("regen")}
          disabled={disabled || regenStatus === "generating"}
        >
          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
          title={`Generate new-angle candidate${page.rawData?.scene?.cameraView ? ` (now: ${page.rawData.scene.cameraView})` : ""}`}
          onClick={() => onRegenerate("angle")}
          disabled={disabled || angleStatus === "generating"}
        >
          <FontAwesomeIcon icon={faCameraRotate} className="h-3.5 w-3.5" />
        </button>
        {page.redesignedUrl && isRegenerated && (
          <button
            className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
            title="Revert to redesigned result"
            onClick={() => onApply("redesign")}
            disabled={disabled || isApplying}
          >
            <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Candidate slot: mini thumbnail + Use button ---

function CandidateSlot({
  label,
  url,
  status,
  active,
  applying,
  onUse,
}: {
  label: string;
  url?: string;
  status?: "generating" | "error";
  active: boolean;
  applying: boolean;
  onUse: () => void;
}) {
  if (!url && !status) return null;

  return (
    <div className="w-14 text-center">
      <div
        className={`h-14 w-10 mx-auto overflow-hidden rounded border bg-muted ${
          active ? "border-green-500 ring-1 ring-green-500" : ""
        }`}
      >
        {status === "generating" ? (
          <div className="flex h-full items-center justify-center">
            <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-muted-foreground" />
          </div>
        ) : status === "error" ? (
          <div className="flex h-full items-center justify-center text-[8px] text-red-500">
            Failed
          </div>
        ) : (
          <img src={resolveUrl(url)} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <p className="mt-0.5 truncate text-[8px] text-muted-foreground" title={label}>
        {label}
      </p>
      {url && status !== "generating" && (
        <button
          className={`mt-0.5 w-full rounded border px-1 py-0.5 text-[9px] font-medium disabled:opacity-40 ${
            active
              ? "border-green-500 text-green-600"
              : "border-input hover:bg-accent"
          }`}
          onClick={onUse}
          disabled={applying || active}
        >
          {active ? "In use" : "Use"}
        </button>
      )}
    </div>
  );
}
