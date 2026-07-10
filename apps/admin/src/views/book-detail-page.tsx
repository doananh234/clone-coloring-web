import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRestGetOne, useRestGetAll, appApi } from "@vx/core-uikit/api";
import { Badge, Button, Separator } from "@vx/core-uikit/components";
import type { FabricSceneJSON, StyleFilter } from "@vx/server-core/text-overlay";

// Replacement for firestoreUpdate: PUT to /api/books/:id
async function firestoreUpdate(
  _firestore: unknown,
  _collection: string,
  bookId: string,
  data: Record<string, unknown>,
) {
  return appApi.put(`/api/books/${bookId}`, data);
}
import { notify } from "@vx/core-uikit/notifications";
import { useRouter } from "next/navigation";
import React from "react";
import { CoverEditorModal } from "@/components/cover-editor/cover-editor-modal";
import { DEFAULT_SLOT_STATE, type CoverEditorInitialState } from "@/components/cover-editor/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPencil,
  faFileLines,
  faEye,
  faSparkles,
  faRotate,
  faUpload,
  faEllipsisVertical,
  faDroplet,
  faSpinner,
  faCode,
  faChevronDown,
  faChevronRight,
  faFont,
  faDownload,
} from "@fortawesome/pro-regular-svg-icons";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
      Loading editor…
    </div>
  ),
});
import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@vx/core-uikit/components";
import { ColoringStylePicker } from "@/components/coloring-style-picker";
import type { ColoringStyleEntity } from "@vx/server-core/ai/coloring-style-types";
import { DetailCard } from "@/components/detail-card";
import { ImageGrid, type ImageItem } from "@/components/image-grid";
import { ImageLightbox } from "@/components/image-lightbox";
import { ExtractionReviewModal } from "@/components/extraction-review-modal";
import { appNavigate } from "@/lib/navigate";
import type { BookEntity } from "@/crud/books";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

function formatDate(val: unknown): string {
  if (!val) return "—";
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toDate === "function")
      return (obj as { toDate(): Date }).toDate().toLocaleDateString();
    if (typeof obj.seconds === "number") return new Date(obj.seconds * 1000).toLocaleDateString();
  }
  return "—";
}

export function BookDetailPage({ bookId }: { bookId: string }) {
  const { t } = useTranslation("books");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const firestore = {} as unknown;

  const {
    data: book,
    isLoading,
    refresh,
  } = useRestGetOne<BookEntity>({
    entityName: "books",
    url: "/api/books/:id",
    pathParams: { id: bookId },
    enabled: !!bookId,
  });

  // Source-reference metadata: lives on book.data for both worker- and admin-created books.
  const bookData = ((book as unknown as { data?: Record<string, unknown> })?.data) ?? {};
  const sourceBookId = (bookData.sourceBookId as string | undefined) ?? undefined;
  const cloneJobId = (bookData.cloneJobId as string | undefined) ?? undefined;

  // Extract coverMeta from bookData safely
  const coverMeta = ((bookData as { coverMeta?: {
    titleCover?: string;
    subtitle?: string;
    sourceThumbnailUrl?: string;
  } })?.coverMeta) ?? undefined;

  // Fetch the source book metadata when this book was cloned from another book.
  const { data: sourceBook } = useRestGetOne<BookEntity>({
    entityName: "books",
    url: "/api/books/:id",
    pathParams: { id: sourceBookId ?? "" },
    enabled: !!sourceBookId,
  });

  // Brand list, cached by React Query — used to resolve the cover editor's
  // brand slot text from Book.data.brandId or Book.data.brand (name).
  const { data: brandList } = useRestGetAll<{ id: string; name: string; displayName?: string | null }>({
    entityName: "brands",
    url: "/api/brands",
    limit: 200,
    enabled: !!book,
  });

  const [generatingSubtitle, setGeneratingSubtitle] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadingR2, setUploadingR2] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<ImageItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [pageFilter, setPageFilter] = useState<"all" | "public" | "private">("all");
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [extractionImageUrl, setExtractionImageUrl] = useState("");
  const [extractionPageId, setExtractionPageId] = useState("");
  const [colorizeOpen, setColorizeOpen] = useState(false);
  const [colorizePageId, setColorizePageId] = useState("");
  const [colorizePageUrl, setColorizePageUrl] = useState("");
  const [colorizeStyleId, setColorizeStyleId] = useState<string | null>(null);
  const [_colorizeStyleData, setColorizeStyleData] = useState<ColoringStyleEntity | null>(null);
  const [colorizing, setColorizing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [jsonViewOpen, setJsonViewOpen] = useState(false);
  const [redesignOpen, setRedesignOpen] = useState(false);
  const [redesignPageId, setRedesignPageId] = useState("");
  const [redesignPageUrl, setRedesignPageUrl] = useState("");
  const [redesignPrompt, setRedesignPrompt] = useState("");
  const [redesignCharRefs, setRedesignCharRefs] = useState<string[]>([]);
  const [redesignLocRefs, setRedesignLocRefs] = useState<string[]>([]);
  const [redesigning, setRedesigning] = useState(false);
  const [coverEditorOpen, setCoverEditorOpen] = React.useState(false);
  const [uploadingCover, setUploadingCover] = React.useState(false);
  const coverUploadInputRef = React.useRef<HTMLInputElement | null>(null);

  // Upload Cover: user picks an image → base64 → POST cover-export
  //   (imageBase64 mode) → get back r2 url → PUT book.coverUrl.
  //   Reuses the same upload path Save Cover uses so no new endpoint.
  const handleCoverUpload = React.useCallback(
    async (file: File) => {
      if (!book?.id) return;
      setUploadingCover(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("failed to read file"));
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/generate/cover-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId: book.id, imageBase64: dataUrl }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload failed (${res.status})`);
        }
        const { url } = (await res.json()) as { url: string; base64: string };
        await fetch(`/api/books/${book.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: url }),
        });
        if (typeof refresh === "function") await refresh();
        notify.success("Cover uploaded");
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploadingCover(false);
      }
    },
    [book?.id, refresh],
  );

  // Download Original: fetch the clean colored illustration (no text) via
  //   the same-origin proxy so cross-origin CORS doesn't kill the download,
  //   then trigger a browser download with a friendly filename.
  const handleDownloadOriginal = React.useCallback(async () => {
    if (!book) return;
    const coverMetaObj = (bookData as { coverMeta?: { sourceThumbnailUrl?: string } })
      ?.coverMeta;
    const originalUrl =
      coverMetaObj?.sourceThumbnailUrl ??
      book.thumbnailUrl ??
      book.squareThumbnailUrl ??
      "";
    if (!originalUrl) {
      notify.error("No original illustration available for this book");
      return;
    }
    try {
      const absoluteUrl = resolveUrl(originalUrl);
      const proxied = absoluteUrl.startsWith("/")
        ? absoluteUrl
        : `/api/proxy-image?url=${encodeURIComponent(absoluteUrl)}`;
      const resp = await fetch(proxied);
      if (!resp.ok) throw new Error(`fetch failed (${resp.status})`);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${(book.title || "cover").replace(/[^\w-]+/g, "-")}-original.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Download failed");
    }
  }, [book, bookData]);

  const editorInitial = React.useMemo<CoverEditorInitialState | null>(() => {
    if (!book) return null;
    const meta = (bookData as { coverMeta?: Record<string, unknown> })?.coverMeta;
    const metaObj = meta as { sourceThumbnailUrl?: string; titleCover?: string; subtitle?: string; scene?: unknown; filter?: string } | undefined;
    // Resolve the brand slot text: prefer the Brand row's displayName (or
    // name) from the cached list; fall back to the raw brand name snapshot
    // on the book. Empty string means the slot renders no brand text at all
    // (no more "(empty)" placeholder bleeding into the AI blend result).
    const brandIdKey = typeof bookData?.brandId === "string" ? bookData.brandId : "";
    const brandNameKey = typeof bookData?.brand === "string" ? bookData.brand : "";
    const matched =
      (brandIdKey && brandList.find((b) => b.id === brandIdKey)) ||
      (brandNameKey && brandList.find((b) => b.name === brandNameKey)) ||
      null;
    const brandName = matched
      ? (matched.displayName?.trim() || matched.name || "")
      : brandNameKey;
    return {
      bookId: book.id,
      backgroundUrl: resolveUrl(metaObj?.sourceThumbnailUrl ?? book.coverUrl ?? ""),
      scene: metaObj?.scene as FabricSceneJSON | undefined,
      slots: {
        ...DEFAULT_SLOT_STATE,
        title: {
          ...DEFAULT_SLOT_STATE.title,
          text: metaObj?.titleCover ?? book.title ?? "",
        },
        subtitle: {
          ...DEFAULT_SLOT_STATE.subtitle,
          text: metaObj?.subtitle ?? book.subtitle ?? "",
        },
        brand: { ...DEFAULT_SLOT_STATE.brand, text: brandName },
      },
      filter: (metaObj?.filter ?? "none") as StyleFilter,
    };
  }, [book, bookData, brandList]);

  function openLightbox(images: ImageItem[], index: number) {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  function handleExtract(image: ImageItem) {
    setExtractionImageUrl(resolveUrl(image.url));
    setExtractionPageId(image.id);
    setLightboxOpen(false);
    setExtractionOpen(true);
  }

  function handleRedesignOpen(image: ImageItem) {
    setRedesignPageId(image.id);
    setRedesignPageUrl(resolveUrl(image.url));
    setRedesignPrompt(image.prompt || "");
    setRedesignCharRefs(image.characterReferenceImageUrls || []);
    setRedesignLocRefs(image.locationReferenceImageUrls || []);
    setLightboxOpen(false);
    setRedesignOpen(true);
  }

  async function handleRedesign() {
    if (!redesignPrompt.trim() || !redesignPageUrl || !firestore) return;
    setRedesigning(true);
    try {
      const res = await fetch("/api/generate/coloring-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: redesignPrompt,
          characterReferenceImageUrls: redesignCharRefs.length > 0 ? redesignCharRefs : undefined,
          locationReferenceImageUrls: redesignLocRefs.length > 0 ? redesignLocRefs : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        notify.error(data.error || "Redesign failed");
        return;
      }

      // Upload to R2
      const uploadRes = await fetch("/api/generate/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: data.base64,
          key: `assets/${bookId}/pages/${redesignPageId}.png`,
        }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        notify.error("Failed to upload redesigned page");
        return;
      }

      // Update the page URL + prompt in Firestore (cache-bust so value always changes)
      const newUrl = `${uploadData.url}?v=${Date.now()}`;
      const updatePages = (pages: { id: string; url: string; isPublic?: boolean; prompt?: string }[]) =>
        pages.map((p) =>
          p.id === redesignPageId ? { ...p, url: newUrl, prompt: redesignPrompt } : p,
        );

      await firestoreUpdate(firestore, "books", bookId, {
        coloringPages: updatePages(book?.coloringPages ?? []),
      });

      notify.success("Page redesigned successfully");
      refresh();
      setRedesignOpen(false);
    } catch {
      notify.error("Redesign failed");
    } finally {
      setRedesigning(false);
    }
  }

  async function handleSetAsCover(imageUrl: string) {
    if (!firestore) return;
    try {
      await firestoreUpdate(firestore, "books", bookId, { coverUrl: imageUrl });
      notify.success("Cover updated");
      refresh();
    } catch {
      notify.error("Failed to update cover");
    }
  }

  async function handleSetAsThumbnail(imageUrl: string) {
    if (!firestore) return;
    try {
      await firestoreUpdate(firestore, "books", bookId, { thumbnailUrl: imageUrl });
      notify.success("Thumbnail updated");
      refresh();
    } catch {
      notify.error("Failed to update thumbnail");
    }
  }

  async function handleSetAsSquare(imageUrl: string) {
    if (!firestore) return;
    try {
      await firestoreUpdate(firestore, "books", bookId, { squareThumbnailUrl: imageUrl });
      notify.success("Square thumbnail updated");
      refresh();
    } catch {
      notify.error("Failed to update thumbnail");
    }
  }


  async function handleColorize() {
    if (!colorizeStyleId || !colorizePageUrl) return;
    setColorizing(true);
    try {
      const res = await fetch("/api/coloring-styles/colorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: colorizePageUrl,
          coloringStyleId: colorizeStyleId,
          bookId,
          pageId: colorizePageId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success("Page colorized successfully");
        refresh();
        setColorizeOpen(false);
      } else {
        notify.error(data.error || "Colorization failed");
      }
    } catch {
      notify.error("Colorization failed");
    } finally {
      setColorizing(false);
    }
  }

  async function toggleField(field: string, value: boolean) {
    if (!firestore) return;
    try {
      await firestoreUpdate(firestore, "books", bookId, { [field]: value });
      refresh();
      notify.success(`${field === "isPublic" ? "Visibility" : "Tier"} updated`);
    } catch {
      notify.error("Failed to update");
    }
  }

  const handleTogglePublic = useCallback(
    async (image: ImageItem, isPublic: boolean) => {
      if (!book || !firestore) return;
      // Update the page's isPublic in the coloringPages or summaryPages array
      const updateArray = (pages: { id: string; url: string; isPublic?: boolean }[]) =>
        pages.map((p) => (p.id === image.id ? { ...p, isPublic } : p));

      const updatedColoring = updateArray(book.coloringPages ?? []);
      const updatedSummary = updateArray(book.summaryPages ?? []);

      try {
        await firestoreUpdate(firestore, "books", bookId, {
          coloringPages: updatedColoring,
          summaryPages: updatedSummary,
        });
        // Update lightbox images state to reflect change immediately
        setLightboxImages((prev) =>
          prev.map((img) => (img.id === image.id ? { ...img, isPublic } : img)),
        );
        refresh();
        notify.success(isPublic ? "Page set to Public" : "Page set to Private");
      } catch {
        notify.error("Failed to update page visibility");
      }
    },
    [book, firestore, bookId, refresh],
  );

  if (isLoading || !book) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">{tc("loading")}</p>
      </div>
    );
  }

  // Merge orphan colorize entries (legacy: {pageId, coloredUrl}) back onto real pages
  const rawPages = book.coloringPages ?? [];
  const coloringPages: ImageItem[] = (() => {
    // Separate real pages (have url) from orphan colorize entries (have pageId but no url)
    type RawPage = {
      id?: string;
      pageId?: string;
      url?: string;
      isPublic?: boolean;
      coloredUrl?: string;
      coloringStyleId?: string;
      prompt?: string;
      characterReferenceImageUrls?: string[];
      locationReferenceImageUrls?: string[];
    };
    const realPages = (rawPages as RawPage[]).filter((p) => p.id && p.url);
    const orphans = (rawPages as RawPage[]).filter((p) => !p.url && p.pageId && p.coloredUrl);

    // Build lookup from orphan pageId → coloredUrl
    const orphanMap = new Map(
      orphans.map((o) => [
        o.pageId!,
        { coloredUrl: o.coloredUrl!, coloringStyleId: o.coloringStyleId },
      ]),
    );

    return realPages.map((p) => {
      const orphan = orphanMap.get(p.id!);
      return {
        id: p.id!,
        url: p.url!,
        isPublic: p.isPublic,
        coloredUrl: p.coloredUrl || orphan?.coloredUrl,
        coloringStyleId: p.coloringStyleId || orphan?.coloringStyleId,
        prompt: p.prompt,
        characterReferenceImageUrls: p.characterReferenceImageUrls,
        locationReferenceImageUrls: p.locationReferenceImageUrls,
      };
    });
  })();

  const summaryPages: ImageItem[] = (book.summaryPages ?? []).map((p) => ({
    id: p.id,
    url: p.url,
    isPublic: p.isPublic,
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{book.title}</h1>
          {book.badge && <Badge variant="secondary">{book.badge}</Badge>}
          <button
            type="button"
            onClick={() => toggleField("isPublic", !book.isPublic)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              book.isPublic
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {book.isPublic ? "Public" : "Private"}
          </button>
          <button
            type="button"
            onClick={() => toggleField("isPremium", !book.isPremium)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              book.isPremium
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {book.isPremium ? "Premium" : "Free"}
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => appNavigate(`/books/${bookId}/edit`)}>
            <FontAwesomeIcon icon={faPencil} className="mr-1.5 h-3.5 w-3.5" />
            {tc("edit")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" className="h-8 w-8" />}
            >
              <FontAwesomeIcon icon={faEllipsisVertical} className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                disabled={generatingSubtitle}
                onClick={async () => {
                  setGeneratingSubtitle(true);
                  try {
                    const res = await fetch(`/api/books/${bookId}/generate-subtitle`, {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (data.subtitle) {
                      notify.success(`Subtitle: "${data.subtitle}"`);
                      refresh();
                    } else {
                      notify.error(data.error || "Failed");
                    }
                  } catch {
                    notify.error("Failed to generate subtitle");
                  } finally {
                    setGeneratingSubtitle(false);
                  }
                }}
              >
                <FontAwesomeIcon icon={faSparkles} className="mr-2 h-4 w-4" />
                {generatingSubtitle ? "Generating..." : "Generate Subtitle"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={syncing}
                onClick={async () => {
                  if (!book.categoryId) {
                    notify.error("No category assigned");
                    return;
                  }
                  setSyncing(true);
                  try {
                    const res = await fetch("/api/books/sync-categories", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ bookId, categoryId: book.categoryId }),
                    });
                    const data = await res.json();
                    if (data.success) notify.success(`Synced ${data.bookCount} books to category`);
                    else notify.error(data.error || "Sync failed");
                  } catch {
                    notify.error("Sync failed");
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                <FontAwesomeIcon icon={faRotate} spin={syncing} className="mr-2 h-4 w-4" />
                Sync Category
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={uploadingR2}
                onClick={async () => {
                  setUploadingR2(true);
                  try {
                    const res = await fetch(`/api/books/${bookId}/upload-to-r2`, {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (data.success) {
                      notify.success(`Uploaded ${data.uploaded} files to R2`);
                      refresh();
                    } else notify.error(data.error || "Upload failed");
                  } catch {
                    notify.error("R2 upload failed");
                  } finally {
                    setUploadingR2(false);
                  }
                }}
              >
                <FontAwesomeIcon
                  icon={faUpload}
                  className={`mr-2 h-4 w-4 ${uploadingR2 ? "animate-pulse" : ""}`}
                />
                {uploadingR2 ? "Uploading..." : "Upload to R2"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={generatingPdf || !coloringPages.length}
                onClick={async () => {
                  setGeneratingPdf(true);
                  try {
                    const res = await fetch(`/api/books/${bookId}/generate-pdf`, {
                      method: "POST",
                    });
                    const data = await res.json();
                    if (data.success) {
                      notify.success(`PDF generated (${data.pageCount} pages)`);
                      refresh();
                    } else {
                      notify.error(data.error || "PDF generation failed");
                    }
                  } catch {
                    notify.error("PDF generation failed");
                  } finally {
                    setGeneratingPdf(false);
                  }
                }}
              >
                <FontAwesomeIcon
                  icon={faFileLines}
                  className={`mr-2 h-4 w-4 ${generatingPdf ? "animate-pulse" : ""}`}
                />
                {generatingPdf ? "Generating PDF..." : "Generate PDF"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT PANEL -- Sticky Media */}
        <div className="w-[280px] shrink-0 space-y-4 self-start sticky top-4">
          {/* Cover */}
          <div className="overflow-hidden rounded-lg border">
            {book.coverUrl ? (
              <img
                src={resolveUrl(book.coverUrl)}
                alt={book.title}
                className="w-full object-cover"
                style={{ maxHeight: 280 }}
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center bg-muted text-muted-foreground">
                No cover
              </div>
            )}
          </div>
          {book.coverUrl && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setCoverEditorOpen(true)}
            >
              <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
              Edit Cover
            </Button>
          )}
          {/* Hidden file input driven by the Upload Cover button below. */}
          <input
            ref={coverUploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCoverUpload(file);
              e.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={uploadingCover}
              onClick={() => coverUploadInputRef.current?.click()}
            >
              {uploadingCover ? (
                <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FontAwesomeIcon icon={faUpload} className="mr-1.5 h-3.5 w-3.5" />
              )}
              {uploadingCover ? "Uploading…" : "Upload"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
              title="Download the clean colored illustration (no text) for manual editing"
            >
              <FontAwesomeIcon icon={faDownload} className="mr-1.5 h-3.5 w-3.5" />
              Original
            </Button>
          </div>

          {/* Thumbnail variants — both are 1:1 now (worker writes the same
              square asset to both URL fields). */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                Thumbnail
              </p>
              {book.thumbnailUrl ? (
                <img
                  src={resolveUrl(book.thumbnailUrl)}
                  alt=""
                  className="aspect-square w-full rounded border object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                Square
              </p>
              {book.squareThumbnailUrl ? (
                <img
                  src={resolveUrl(book.squareThumbnailUrl)}
                  alt=""
                  className="aspect-square w-full rounded border object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
          </div>

          {/* Specifications */}
          <DetailCard title={t("fields.specifications")}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pages</dt>
                <dd className="font-medium">{book.specifications?.pages ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd className="font-medium">{book.specifications?.dimensions ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Age Range</dt>
                <dd className="font-medium">{book.specifications?.ageRange ?? "—"}</dd>
              </div>
            </dl>
          </DetailCard>

          {/* Pricing */}
          <DetailCard title="Pricing">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.price")}</dt>
                <dd className="font-semibold text-green-600">
                  {book.price ? `$${book.price}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.originalPrice")}</dt>
                <dd>{book.originalPrice ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("fields.discount")}</dt>
                <dd>{book.discount ?? "—"}</dd>
              </div>
            </dl>
          </DetailCard>

          {/* Files */}
          <DetailCard title="Files">
            <div className="space-y-2 text-sm">
              {book.pdfUrl ? (
                <a
                  href={resolveUrl(book.pdfUrl)}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <FontAwesomeIcon icon={faFileLines} className="h-3.5 w-3.5" /> PDF Download
                </a>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={generatingPdf || !coloringPages.length}
                  onClick={async () => {
                    setGeneratingPdf(true);
                    try {
                      const res = await fetch(`/api/books/${bookId}/generate-pdf`, {
                        method: "POST",
                      });
                      const data = await res.json();
                      if (data.success) {
                        notify.success(`PDF generated (${data.pageCount} pages)`);
                        refresh();
                      } else {
                        notify.error(data.error || "PDF generation failed");
                      }
                    } catch {
                      notify.error("PDF generation failed");
                    } finally {
                      setGeneratingPdf(false);
                    }
                  }}
                >
                  {generatingPdf ? (
                    <FontAwesomeIcon icon={faSpinner} spin className="mr-1 h-3 w-3" />
                  ) : (
                    <FontAwesomeIcon icon={faFileLines} className="mr-1 h-3 w-3" />
                  )}
                  {generatingPdf ? "Generating..." : "Generate PDF"}
                </Button>
              )}
              {book.tryoutPage ? (
                <a
                  href={resolveUrl(book.tryoutPage)}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" /> Tryout Page
                </a>
              ) : (
                <p className="text-muted-foreground">No tryout page</p>
              )}
            </div>
          </DetailCard>
        </div>

        {/* RIGHT PANEL -- Scrollable Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Book Info */}
          <DetailCard title={t("title")}>
            <dl className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("fields.title")}</dt>
              <dd>{book.title}</dd>
              <dt className="text-muted-foreground">{t("fields.subtitle")}</dt>
              <dd>{book.subtitle ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("fields.category")}</dt>
              <dd>{book.category ?? book.categoryId ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("fields.badge")}</dt>
              <dd>{book.badge ? <Badge variant="secondary">{book.badge}</Badge> : "—"}</dd>
              <dt className="text-muted-foreground">{t("fields.backgroundColor")}</dt>
              <dd>
                {book.backgroundColor ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded border"
                      style={{ backgroundColor: book.backgroundColor }}
                    />
                    <span className="font-mono text-xs">{book.backgroundColor}</span>
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {book.description && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("fields.description")}</p>
                  <p className="text-sm leading-relaxed">{book.description}</p>
                </div>
              </>
            )}
          </DetailCard>

          {/* Coloring Pages */}
          {coloringPages.length > 0 &&
            (() => {
              const publicCount = coloringPages.filter((p) => p.isPublic).length;
              const privateCount = coloringPages.length - publicCount;
              const filtered =
                pageFilter === "all"
                  ? coloringPages
                  : pageFilter === "public"
                    ? coloringPages.filter((p) => p.isPublic)
                    : coloringPages.filter((p) => !p.isPublic);
              return (
                <DetailCard
                  title={t("fields.coloringPages")}
                  subtitle={`${coloringPages.length} pages`}
                  actions={
                    <div className="flex gap-1">
                      {(["all", "public", "private"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setPageFilter(f)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            pageFilter === f
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {f === "all"
                            ? `All (${coloringPages.length})`
                            : f === "public"
                              ? `Public (${publicCount})`
                              : `Private (${privateCount})`}
                        </button>
                      ))}
                    </div>
                  }
                >
                  {filtered.length > 0 ? (
                    <ImageGrid
                      images={filtered}
                      resolveUrl={resolveUrl}
                      columns={5}
                      maxVisible={999}
                      showPublicIndicator
                      onImageClick={(_, idx) => openLightbox(filtered, idx)}
                    />
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No {pageFilter} pages
                    </p>
                  )}
                </DetailCard>
              );
            })()}

          {/* Summary Pages */}
          {summaryPages.length > 0 && (
            <DetailCard title={t("fields.summaryPages")} subtitle={`${summaryPages.length} pages`}>
              <ImageGrid
                images={summaryPages}
                resolveUrl={resolveUrl}
                columns={5}
                maxVisible={999}
                showPublicIndicator
                onImageClick={(_, idx) => openLightbox(summaryPages, idx)}
              />
            </DetailCard>
          )}

          {/* Settings & Metadata */}
          <DetailCard title="Settings & Metadata">
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("fields.isConverted")}</dt>
              <dd>
                {book.isConverted ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("fields.isRedesigned")}</dt>
              <dd>
                {book.isRedesigned ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("fields.isEditionConverted")}</dt>
              <dd>
                {book.isEditionConverted ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-muted-foreground">No</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("fields.isPublic")}</dt>
              <dd>
                {book.isPublic ? (
                  <span className="text-green-600">✓ Public</span>
                ) : (
                  <span className="text-muted-foreground">✗ Private</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("fields.isPremium")}</dt>
              <dd>
                {book.isPremium ? (
                  <span className="text-amber-600">✓ Premium</span>
                ) : (
                  <span className="text-muted-foreground">✗ Free</span>
                )}
              </dd>
              <dt className="text-muted-foreground">{t("fields.createdAt")}</dt>
              <dd>{formatDate(book.createdAt)}</dd>
              <dt className="text-muted-foreground">{t("fields.updatedAt")}</dt>
              <dd>{formatDate(book.updatedAt)}</dd>
            </dl>
          </DetailCard>

          {/* Source Reference — shown only for cloned books */}
          {(sourceBookId || cloneJobId) && (
            <DetailCard title="Source Reference" subtitle="Where this book was cloned from">
              <div className="space-y-4 text-sm">
                {sourceBookId && (
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Original Book
                    </p>
                    {sourceBook ? (
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        {sourceBook.thumbnailUrl ? (
                          <img
                            src={resolveUrl(sourceBook.thumbnailUrl)}
                            alt={sourceBook.title}
                            className="h-20 w-16 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                            —
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{sourceBook.title}</p>
                          {sourceBook.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">
                              {sourceBook.subtitle}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => appNavigate(`/books/${sourceBookId}`)}
                            className="mt-1 text-xs text-primary hover:underline"
                          >
                            View original →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md border p-3 text-xs text-muted-foreground">
                        Source book ID: <code className="font-mono">{sourceBookId}</code>
                        <span className="ml-2">(loading…)</span>
                      </div>
                    )}
                  </div>
                )}
                {cloneJobId && (
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Clone Job
                    </p>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <code className="truncate font-mono text-xs">{cloneJobId}</code>
                      <button
                        type="button"
                        onClick={() => appNavigate(`/clone/${cloneJobId}`)}
                        className="ml-3 shrink-0 text-xs text-primary hover:underline"
                      >
                        View clone job →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </DetailCard>
          )}

          {/* Raw JSON View */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setJsonViewOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
            >
              <FontAwesomeIcon
                icon={jsonViewOpen ? faChevronDown : faChevronRight}
                className="h-3 w-3 text-muted-foreground"
              />
              <FontAwesomeIcon icon={faCode} className="h-3.5 w-3.5 text-muted-foreground" />
              Raw JSON Data
            </button>
            {jsonViewOpen && (
              <div className="border-t">
                <MonacoEditor
                  height="400px"
                  language="json"
                  theme="vs-dark"
                  value={JSON.stringify(book, null, 2)}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    lineNumbers: "on",
                    wordWrap: "on",
                    folding: true,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        resolveUrl={resolveUrl}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
        onTogglePublic={handleTogglePublic}
        onExtract={handleExtract}
        onRedesign={handleRedesignOpen}
        onSetAsCover={handleSetAsCover}
        onSetAsThumbnail={handleSetAsThumbnail}
        onSetAsSquare={handleSetAsSquare}
        onColorize={(image) => {
          setColorizePageId(image.id);
          setColorizePageUrl(resolveUrl(image.url));
          setLightboxOpen(false);
          setColorizeOpen(true);
        }}
      />

      {/* Extraction Review Modal */}
      <ExtractionReviewModal
        open={extractionOpen}
        onOpenChange={setExtractionOpen}
        imageUrl={extractionImageUrl}
        sourceBookId={bookId}
        sourcePageId={extractionPageId}
      />

      {/* Colorize Modal */}
      <Dialog open={colorizeOpen} onOpenChange={setColorizeOpen}>
        <DialogContent className="!max-w-md">
          <h2 className="text-lg font-semibold mb-3">Colorize Page</h2>
          {colorizePageUrl && (
            <div className="mb-3 overflow-hidden rounded-lg border">
              <img
                src={colorizePageUrl}
                alt="Page to colorize"
                className="w-full object-cover"
                style={{ maxHeight: 200 }}
              />
            </div>
          )}
          <div className="mb-3">
            <label className="text-sm font-medium mb-1.5 block">Coloring Style</label>
            <ColoringStylePicker
              value={colorizeStyleId}
              onChange={(id, data) => {
                setColorizeStyleId(id);
                setColorizeStyleData(data);
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setColorizeOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!colorizeStyleId || colorizing} onClick={handleColorize}>
              {colorizing ? (
                <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FontAwesomeIcon icon={faDroplet} className="mr-1.5 h-3.5 w-3.5" />
              )}
              {colorizing ? "Colorizing..." : "Colorize"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Redesign Modal */}
      <Dialog open={redesignOpen} onOpenChange={setRedesignOpen}>
        <DialogContent className="!max-w-md">
          <h2 className="text-lg font-semibold mb-3">Redesign Page</h2>
          {redesignPageUrl && (
            <div className="mb-3 overflow-hidden rounded-lg border">
              <img
                src={redesignPageUrl}
                alt="Page to redesign"
                className="w-full max-h-[200px] object-contain"
              />
            </div>
          )}
          {(redesignCharRefs.length > 0 || redesignLocRefs.length > 0) && (
            <div className="mb-3 rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground space-y-1">
              {redesignCharRefs.length > 0 && (
                <p>
                  <span className="font-medium">Character refs:</span> {redesignCharRefs.length} image(s) will be used
                </p>
              )}
              {redesignLocRefs.length > 0 && (
                <p>
                  <span className="font-medium">Location refs:</span> {redesignLocRefs.length} image(s) will be used
                </p>
              )}
            </div>
          )}
          <div className="mb-3">
            <label className="text-sm font-medium mb-1.5 block">
              Generation prompt (edit to change the page content)
            </label>
            {!redesignPrompt && (
              <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                No saved prompt for this page. Write a detailed description of what you want — include characters, scene, mood, and composition for best results.
              </div>
            )}
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={6}
              placeholder="Describe the scene: characters, location, activity, mood, composition..."
              value={redesignPrompt}
              onChange={(e) => setRedesignPrompt(e.target.value)}
              disabled={redesigning}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRedesignOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!redesignPrompt.trim() || redesigning} onClick={handleRedesign}>
              {redesigning ? (
                <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FontAwesomeIcon icon={faRotate} className="mr-1.5 h-3.5 w-3.5" />
              )}
              {redesigning ? "Redesigning..." : "Redesign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cover Editor Modal */}
      {editorInitial && (
        <CoverEditorModal
          open={coverEditorOpen}
          onOpenChange={setCoverEditorOpen}
          initialState={editorInitial}
          onSave={async (result) => {
            const currentMeta =
              ((bookData as { coverMeta?: Record<string, unknown> })?.coverMeta as Record<string, unknown> | null | undefined) ?? {};
            const nextMeta = {
              ...currentMeta,
              scene: result.scene,
              filter: result.filter,
              status: "manual",
              editedAt: new Date().toISOString(),
            };
            // Only overwrite coverUrl. Leave thumbnailUrl + squareThumbnailUrl
            // pointing at the clean colored illustration (no text) so we can
            // recover / regenerate later without losing the pre-text source.
            await fetch(`/api/books/${book.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                coverUrl: result.coverUrl,
                data: { ...bookData, coverMeta: nextMeta },
              }),
            });
            // Refresh book query (React Query invalidation).
            if (typeof refresh === "function") await refresh();
          }}
        />
      )}
    </div>
  );
}
