"use client";

import { useState } from "react";
import { Button, Label } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faSparkles,
  faCircleCheck,
  faCheck,
  faDroplet,
} from "@fortawesome/pro-regular-svg-icons";
import { cn } from "@vx/core-uikit/utils";
import { ColoringStylePicker } from "@/components/coloring-style-picker";
import type { ColoringStyleEntity } from "@/lib/ai/coloring-style-types";

type GeneratedPage = {
  id: string;
  prompt: string;
  previewUrl: string | null;
  base64: string | null;
  r2Url: string | null;
  status: "pending" | "generating" | "uploading" | "done" | "error";
};

/** Existing book pages that may already have colored versions */
export type ExistingPageItem = {
  id: string;
  url: string;
  coloredUrl?: string;
  coloringStyleId?: string;
};

interface CoverThumbnailStepProps {
  generatedPages: GeneratedPage[];
  title: string;
  bookId: string | null;
  onBack: () => void;
  onSave: (data: { coverPreview: string | null; squarePreview: string | null }) => void;
  saving: boolean;
  /** If provided, user can pick from already-colorized pages */
  existingColoredPages?: ExistingPageItem[];
  /** URL resolver for existing pages */
  resolveUrl?: (url: string | undefined | null) => string;
}

export function CoverThumbnailStep({
  generatedPages,
  title,
  bookId,
  onBack,
  onSave,
  saving,
  existingColoredPages,
  resolveUrl = (url) => url || "",
}: CoverThumbnailStepProps) {
  const donePages = generatedPages.filter((p) => p.status === "done" && p.r2Url);
  const coloredExisting = (existingColoredPages || []).filter((p) => p.coloredUrl);

  // Source mode: "generate" (colorize from B&W) or "existing" (use already-colored pages)
  const [sourceMode, setSourceMode] = useState<"generate" | "existing">(
    coloredExisting.length > 0 ? "existing" : "generate",
  );

  // Coloring style (for generate mode)
  const [coloringStyleId, setColoringStyleId] = useState<string | null>(null);
  const [_coloringStyle, setColoringStyle] = useState<ColoringStyleEntity | null>(null);

  // Square thumbnail
  const [squarePageId, setSquarePageId] = useState<string | null>(null);
  const [squarePreview, setSquarePreview] = useState<string | null>(null);
  const [generatingSquare, setGeneratingSquare] = useState(false);

  // Cover
  const [coverPageIds, setCoverPageIds] = useState<string[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);

  function handleStyleChange(id: string | null, style: ColoringStyleEntity | null) {
    setColoringStyleId(id);
    setColoringStyle(style);
    setSquarePreview(null);
    setCoverPreview(null);
  }

  function toggleCoverPage(pageId: string) {
    setCoverPageIds((prev) => {
      if (prev.includes(pageId)) return prev.filter((id) => id !== pageId);
      if (prev.length >= 4) return prev;
      return [...prev, pageId];
    });
    setCoverPreview(null);
  }

  // --- Square thumbnail: use existing colored URL or generate ---

  async function handleGenerateSquare() {
    if (sourceMode === "existing") {
      const page = coloredExisting.find((p) => p.id === squarePageId);
      if (page?.coloredUrl) {
        setSquarePreview(resolveUrl(page.coloredUrl));
        return;
      }
    }

    const page = donePages.find((p) => p.id === squarePageId);
    if (!page?.r2Url || !coloringStyleId) return;

    setGeneratingSquare(true);
    try {
      const res = await fetch("/api/generate/colorize-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: page.r2Url, coloringStyleId }),
      });
      const data = await res.json();
      if (data.success) {
        setSquarePreview(data.previewUrl);
      } else {
        notify.error(data.error || "Failed to generate thumbnail");
      }
    } catch {
      notify.error("Failed to generate thumbnail");
    } finally {
      setGeneratingSquare(false);
    }
  }

  // --- Cover: use existing colored URLs or generate ---

  async function handleGenerateCover() {
    if (coverPageIds.length < 2) return;

    setGeneratingCover(true);
    try {
      const colorizedUrls: string[] = [];

      for (const pageId of coverPageIds) {
        if (sourceMode === "existing") {
          const existingPage = coloredExisting.find((p) => p.id === pageId);
          if (existingPage?.coloredUrl) {
            colorizedUrls.push(resolveUrl(existingPage.coloredUrl));
            continue;
          }
        }

        // Fallback: colorize the B&W page
        const page = donePages.find((p) => p.id === pageId);
        if (!page?.r2Url || !coloringStyleId) continue;

        const res = await fetch("/api/generate/colorize-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: page.r2Url, coloringStyleId }),
        });
        const data = await res.json();
        if (data.success) {
          colorizedUrls.push(data.previewUrl);
        }
      }

      if (colorizedUrls.length < 2) {
        notify.error("Failed to colorize enough pages for cover");
        setGeneratingCover(false);
        return;
      }

      const res = await fetch("/api/generate/compose-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, imageDataUrls: colorizedUrls }),
      });
      const data = await res.json();
      if (data.success) {
        setCoverPreview(data.previewUrl);
      } else {
        notify.error(data.error || "Failed to generate cover");
      }
    } catch {
      notify.error("Failed to generate cover");
    } finally {
      setGeneratingCover(false);
    }
  }

  // Determine which pages to show in selectors
  const selectablePages =
    sourceMode === "existing"
      ? coloredExisting.map((p) => ({
          id: p.id,
          previewUrl: resolveUrl(p.coloredUrl),
          r2Url: resolveUrl(p.url),
        }))
      : donePages.map((p) => ({
          id: p.id,
          previewUrl: p.previewUrl,
          r2Url: p.r2Url,
        }));

  const canGenerateSquare =
    squarePageId && (sourceMode === "existing" || coloringStyleId) && !generatingSquare;

  const canGenerateCover =
    coverPageIds.length >= 2 && (sourceMode === "existing" || coloringStyleId) && !generatingCover;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Cover & Thumbnails</h2>
      <p className="text-sm text-muted-foreground">
        Select coloring pages to generate colored cover and thumbnail.
      </p>

      {/* Source mode toggle (only show if there are colored pages) */}
      {coloredExisting.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Image Source</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSourceMode("existing");
                setSquarePageId(null);
                setCoverPageIds([]);
                setSquarePreview(null);
                setCoverPreview(null);
              }}
              className={cn(
                "flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                sourceMode === "existing"
                  ? "border-purple-500 bg-purple-50 text-purple-700"
                  : "border-muted text-muted-foreground hover:border-purple-200",
              )}
            >
              <FontAwesomeIcon icon={faDroplet} className="mr-1.5 h-3.5 w-3.5" />
              Use Colored Pages ({coloredExisting.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceMode("generate");
                setSquarePageId(null);
                setCoverPageIds([]);
                setSquarePreview(null);
                setCoverPreview(null);
              }}
              className={cn(
                "flex-1 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors",
                sourceMode === "generate"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted text-muted-foreground hover:border-primary/30",
              )}
            >
              <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
              Colorize B&W Pages
            </button>
          </div>
        </div>
      )}

      {/* Coloring Style Picker (only needed in generate mode) */}
      {sourceMode === "generate" && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Coloring Style</Label>
          <ColoringStylePicker value={coloringStyleId} onChange={handleStyleChange} />
          {!coloringStyleId && (
            <p className="text-xs text-muted-foreground">
              Pick a coloring style first — it will be applied to your selected pages.
            </p>
          )}
        </div>
      )}

      {/* Square Thumbnail */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Square Thumbnail (1:1)</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSquare}
            disabled={!canGenerateSquare}
          >
            {generatingSquare ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
            )}
            {generatingSquare
              ? "Generating..."
              : sourceMode === "existing"
                ? "Use as Thumbnail"
                : "Colorize & Generate"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Select 1 page{sourceMode === "existing" ? " (already colored)" : " to colorize"} as
          thumbnail.
        </p>
        <PageSelector
          pages={selectablePages}
          selectedIds={squarePageId ? [squarePageId] : []}
          onToggle={(id) => {
            setSquarePageId(id === squarePageId ? null : id);
            setSquarePreview(null);
          }}
          maxSelect={1}
        />
        {squarePreview && (
          <div className="flex justify-center">
            <img
              src={squarePreview}
              alt="Square thumbnail"
              className="h-40 w-40 rounded-lg border object-cover"
            />
          </div>
        )}
      </div>

      {/* Cover */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Cover Image</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateCover}
            disabled={!canGenerateCover}
          >
            {generatingCover ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
            )}
            {generatingCover ? "Generating..." : "Compose Cover"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Select 2–4 pages to compose into a cover.{" "}
          <span className="font-medium">{coverPageIds.length}/4 selected</span>
        </p>
        <PageSelector
          pages={selectablePages}
          selectedIds={coverPageIds}
          onToggle={toggleCoverPage}
          maxSelect={4}
        />
        {coverPreview && (
          <div className="flex justify-center">
            <img src={coverPreview} alt="Cover" className="h-52 rounded-lg border object-contain" />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          onClick={() => onSave({ coverPreview, squarePreview })}
          disabled={saving || !title.trim()}
        >
          {saving ? (
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-4 w-4" />
          ) : (
            <FontAwesomeIcon icon={faCircleCheck} className="mr-2 h-4 w-4" />
          )}
          {saving ? "Saving..." : "Finish & Save"}
        </Button>
      </div>
    </div>
  );
}

/* ---------- Page Selector Grid ---------- */

function PageSelector({
  pages,
  selectedIds,
  onToggle,
  maxSelect,
}: {
  pages: { id: string; previewUrl: string | null; r2Url: string | null }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  maxSelect: number;
}) {
  if (pages.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No pages available. Go back and generate pages first.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
      {pages.map((page) => {
        const isSelected = selectedIds.includes(page.id);
        const isDisabled = !isSelected && selectedIds.length >= maxSelect;
        return (
          <button
            key={page.id}
            type="button"
            onClick={() => !isDisabled && onToggle(page.id)}
            className={cn(
              "relative aspect-square rounded-md border-2 overflow-hidden transition",
              isSelected && "border-primary ring-2 ring-primary/30",
              !isSelected && !isDisabled && "border-muted hover:border-primary/50",
              isDisabled && "opacity-40 cursor-not-allowed border-muted",
            )}
          >
            {page.previewUrl && (
              <img src={page.previewUrl} alt="" className="h-full w-full object-cover" />
            )}
            {isSelected && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
