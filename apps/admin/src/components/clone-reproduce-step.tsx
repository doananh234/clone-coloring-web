"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFirestore } from "@vx/core-uikit/firebase";
import { useFirestoreGetAll } from "@vx/core-uikit/firebase";
import { Combobox, Label, Input } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faSparkles,
  faRotate,
  faBook,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/pro-regular-svg-icons";
import { notify } from "@vx/core-uikit/notifications";
import type { CloneJob } from "@/lib/ai/clone-types";
import type { CategoryEntity } from "@/crud/categories";

interface CloneReproduceStepProps {
  job: CloneJob;
  onBack: () => void;
  onNext?: () => void;
}

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
  const firestore = useFirestore();
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

  const { data: categories } = useFirestoreGetAll<CategoryEntity>({
    entityName: "categoriesForClone",
    collectionPath: "categories",
    orderByField: "index",
    orderByDirection: "asc",
    pageSize: 100,
    firestore,
  });

  // Each page: redesigned URL is the "init result", can be overridden by AI regeneration
  const [pageOverrides, setPageOverrides] = useState<Record<number, string>>({});
  const [pageStatus, setPageStatus] = useState<Record<number, "idle" | "generating" | "done" | "error">>({});
  const [generatingAll, setGeneratingAll] = useState(false);

  // Best available image per page: override (regenerated) > redesigned > original
  function bestUrl(index: number): string {
    if (pageOverrides[index]) return pageOverrides[index];
    const page = job.pages[index];
    return page?.redesignedUrl || page?.imageUrl || "";
  }

  // Always true — every page has at least the original image
  const hasAnyResult = job.pages.length > 0;

  const regeneratePage = useCallback(
    async (pageIndex: number) => {
      setPageStatus((prev) => ({ ...prev, [pageIndex]: "generating" }));
      try {
        const res = await fetch(`/api/clone/${job.id}/reproduce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageIndex }),
        });
        const data = await res.json();
        if (data.success && data.results?.[0]?.success) {
          setPageOverrides((prev) => ({ ...prev, [pageIndex]: data.results[0].url }));
          setPageStatus((prev) => ({ ...prev, [pageIndex]: "done" }));
          if (!bookId && data.bookId) setBookId(data.bookId);
        } else {
          setPageStatus((prev) => ({ ...prev, [pageIndex]: "error" }));
          notify.error(data.results?.[0]?.error || "Generation failed");
        }
      } catch {
        setPageStatus((prev) => ({ ...prev, [pageIndex]: "error" }));
      }
    },
    [job.id, bookId],
  );

  async function handleRegenerateAll() {
    setGeneratingAll(true);
    for (let i = 0; i < job.pages.length; i++) {
      if (pageStatus[i] !== "done") {
        await regeneratePage(i);
      }
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
          const status = pageStatus[i] || "idle";
          const currentUrl = bestUrl(i);
          const isRedesigned = !pageOverrides[i] && !!page.redesignedUrl;
          const isRegenerated = !!pageOverrides[i];

          return (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
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
                  {status === "generating" ? (
                    <div className="flex h-full items-center justify-center">
                      <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-muted-foreground" />
                    </div>
                  ) : currentUrl ? (
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
                  {isRegenerated ? "Regenerated" : isRedesigned ? "Redesigned" : status === "error" ? "Error" : "—"}
                </p>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">Page {i + 1}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                  {page.rawData?.scene?.description || page.rawData?.reproductionPrompt?.slice(0, 80) || "—"}
                </p>
              </div>

              {/* Regenerate button */}
              {status !== "generating" && (
                <button
                  className="shrink-0 rounded p-1.5 hover:bg-muted disabled:opacity-40"
                  title="Regenerate with AI"
                  onClick={() => regeneratePage(i)}
                  disabled={generatingAll}
                >
                  <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
