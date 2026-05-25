"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useFirestore } from "@vx/core-uikit/firebase";
import { firestoreCreate, firestoreUpdate, firestoreGetOne } from "@vx/core-uikit/firebase";
import { useFirestoreGetAll } from "@vx/core-uikit/firebase";
import {
  Button,
  Input,
  Textarea,
  Label,
  Card,
  CardContent,
  Combobox,
} from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faFolderOpen,
  faImages,
  faImage,
  faCircleCheck,
  faArrowLeft,
  faSpinner,
  faSparkles,
  faRotate,
  faWandMagicSparkles,
} from "@fortawesome/pro-regular-svg-icons";
import { StoryPlannerStep, type ScenePromptData } from "@/components/story-planner-step";
import { CoverThumbnailStep } from "@/components/cover-thumbnail-step";
import type { CategoryEntity } from "@/crud/categories";
import { cn } from "@vx/core-uikit/utils";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

type BookDraft = {
  title: string;
  subtitle: string;
  description: string;
  price: string;
  categoryId: string;
  category: string;
  badge: string;
  storyIdea: string;
};

type GeneratedPage = {
  id: string;
  prompt: string;
  characterReferenceImageUrls?: string[];
  locationReferenceImageUrls?: string[];
  previewUrl: string | null;
  base64: string | null;
  r2Url: string | null;
  status: "pending" | "generating" | "uploading" | "done" | "error";
};

const STEPS = [
  {
    title: "Category & Story Idea",
    description: "Category, tags & short story",
    icon: faFolderOpen,
  },
  {
    title: "Basic Information",
    description: "Title, description & pricing (AI-assisted)",
    icon: faBookOpen,
  },
  {
    title: "Story Planner",
    description: "Characters, locations & story",
    icon: faWandMagicSparkles,
  },
  { title: "Generate Pages", description: "Generate coloring pages from prompts", icon: faImages },
  { title: "Cover & Thumbnails", description: "Generate cover images with AI", icon: faImage },
];

const COLORING_PAGE_ENDPOINT = "/api/generate/coloring-page";

// --- Helpers ---

async function uploadBase64ToR2(base64: string, key: string): Promise<string | null> {
  try {
    const res = await fetch("/api/generate/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, key }),
    });
    const data = await res.json();
    return data.success ? data.url : null;
  } catch {
    return null;
  }
}

export function BookCreatePage({ existingBookId }: { existingBookId?: string }) {
  const { t } = useTranslation("books");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const firestore = useFirestore();

  const [currentStep, setCurrentStep] = useState(0);
  const [bookId, setBookId] = useState<string | null>(existingBookId || null);
  const [stepSaving, setStepSaving] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!existingBookId);
  const [draft, setDraft] = useState<BookDraft>({
    title: "",
    subtitle: "",
    description: "",
    price: "",
    categoryId: "",
    category: "",
    badge: "",
    storyIdea: "",
  });
  const [generatingBasicInfo, setGeneratingBasicInfo] = useState(false);

  // Step 3: Generated pages
  const [generatedPages, setGeneratedPages] = useState<GeneratedPage[]>([]);

  // Load existing book draft on mount
  useEffect(() => {
    if (!existingBookId || !firestore) return;
    let cancelled = false;

    (async () => {
      try {
        const book = await firestoreGetOne<Record<string, unknown>>(
          firestore,
          "books",
          existingBookId,
        );
        if (cancelled) return;

        setDraft({
          title: (book.title as string) || "",
          subtitle: (book.subtitle as string) || "",
          description: (book.description as string) || "",
          price: (book.price as string) || "",
          categoryId: (book.categoryId as string) || "",
          category: (book.category as string) || "",
          badge: (book.badge as string) || "",
          storyIdea: (book.storyIdea as string) || "",
        });

        // Restore coloring pages
        const pages = (book.coloringPages as Array<{ id: string; url: string }>) || [];
        if (pages.length > 0) {
          setGeneratedPages(
            pages.map((p) => ({
              id: p.id,
              prompt: "",
              previewUrl: p.url,
              base64: null,
              r2Url: p.url,
              status: "done" as const,
            })),
          );
        }

        // Determine which step to resume at
        if (pages.length > 0) {
          setCurrentStep(3); // Has pages, show generate pages step
        } else if (book.title && (book.title as string).trim()) {
          setCurrentStep(2); // Has title, show story planner
        } else if (book.categoryId) {
          setCurrentStep(1); // Has category, show basic info
        }
      } catch {
        notify.error("Failed to load book draft");
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [existingBookId, firestore]);
  const [generatingAll, setGeneratingAll] = useState(false);

  const { data: categories } = useFirestoreGetAll<CategoryEntity>({
    entityName: "categoriesForPicker",
    collectionPath: "categories",
    orderByField: "index",
    orderByDirection: "asc",
    pageSize: 100,
    firestore,
  });

  function updateDraft(field: keyof BookDraft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 0:
        return draft.categoryId.length > 0;
      case 1:
        return draft.title.trim().length > 0;
      default:
        return true;
    }
  }

  // --- Step 0 → 1: Create book in Firebase ---
  async function handleStep0Next() {
    if (!firestore || !canProceed()) return;
    setStepSaving(true);
    try {
      const id = crypto.randomUUID();
      await firestoreCreate(
        firestore,
        "books",
        {
          title: draft.category || "Untitled",
          categoryId: draft.categoryId || undefined,
          category: draft.category || undefined,
          badge: draft.badge || undefined,
          storyIdea: draft.storyIdea || undefined,
          status: "draft",
          coloringPages: [],
          summaryPages: [],
          isPublic: false,
          isPremium: false,
          isConverted: false,
          isRedesigned: false,
          isEditionConverted: false,
        },
        id,
      );
      setBookId(id);
      // Update URL so reload resumes the wizard
      router.replace(`/books/new/${id}`, { scroll: false });
      setCurrentStep(1);
      notify.success("Book draft created");
    } catch (err) {
      console.error("Failed to create book:", err);
      notify.error("Failed to create book draft");
    } finally {
      setStepSaving(false);
    }
  }

  // --- Step 1 → 2: Save basic info ---
  async function handleStep1Next() {
    if (!firestore || !bookId || !canProceed()) return;
    setStepSaving(true);
    try {
      await firestoreUpdate(firestore, "books", bookId, {
        title: draft.title,
        subtitle: draft.subtitle || undefined,
        description: draft.description || undefined,
        price: draft.price || undefined,
      });
      setCurrentStep(2);
    } catch (err) {
      console.error("Failed to save basic info:", err);
      notify.error("Failed to save basic info");
    } finally {
      setStepSaving(false);
    }
  }

  async function handleGenerateBasicInfo() {
    if (!draft.category && !draft.storyIdea) return;
    setGeneratingBasicInfo(true);
    try {
      const res = await fetch("/api/generate/book-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: draft.category, storyIdea: draft.storyIdea }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraft((prev) => ({
          ...prev,
          title: data.title || prev.title,
          subtitle: data.subtitle || prev.subtitle,
          description: data.description || prev.description,
          price: data.price || prev.price,
        }));
        notify.success("Book info generated from your story idea");
      } else {
        notify.error(data.error || "Failed to generate book info");
      }
    } catch {
      notify.error("Failed to generate book info");
    } finally {
      setGeneratingBasicInfo(false);
    }
  }

  // Initialize generated pages from story planner prompts (with optional reference images)
  function initGeneratedPagesFromPrompts(prompts: string[], scenePrompts?: ScenePromptData[]) {
    setGeneratedPages(
      prompts.map((prompt, i) => ({
        id: crypto.randomUUID(),
        prompt,
        characterReferenceImageUrls: scenePrompts?.[i]?.characterReferenceImageUrls || [],
        locationReferenceImageUrls: scenePrompts?.[i]?.locationReferenceImageUrls || [],
        previewUrl: null,
        base64: null,
        r2Url: null,
        status: "pending",
      })),
    );
  }

  // --- Step 3: Generate single page → upload R2 → save to Firebase ---
  const generateSinglePage = useCallback(
    async (index: number) => {
      if (!firestore || !bookId) return;

      setGeneratedPages((prev) =>
        prev.map((p, i) => (i === index ? { ...p, status: "generating" } : p)),
      );

      try {
        // 1. Generate image (with character/location reference images for identity preservation)
        const page = generatedPages[index];
        const res = await fetch(COLORING_PAGE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: page.prompt,
            characterReferenceImageUrls: page.characterReferenceImageUrls,
            locationReferenceImageUrls: page.locationReferenceImageUrls,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setGeneratedPages((prev) =>
            prev.map((p, i) => (i === index ? { ...p, status: "error" } : p)),
          );
          notify.error(data.error || `Failed to generate page ${index + 1}`);
          return;
        }

        // 2. Upload to R2
        setGeneratedPages((prev) =>
          prev.map((p, i) =>
            i === index
              ? { ...p, previewUrl: data.previewUrl, base64: data.base64, status: "uploading" }
              : p,
          ),
        );

        const pageId = generatedPages[index].id;
        const r2Url = await uploadBase64ToR2(data.base64, `assets/${bookId}/pages/${pageId}.png`);

        if (!r2Url) {
          setGeneratedPages((prev) =>
            prev.map((p, i) => (i === index ? { ...p, status: "error" } : p)),
          );
          notify.error(`Failed to upload page ${index + 1}`);
          return;
        }

        // 3. Save to Firebase
        setGeneratedPages((prev) => {
          const updated = prev.map((p, i) =>
            i === index ? { ...p, r2Url, status: "done" as const } : p,
          );

          // Update Firebase with all done pages (persist generation context)
          const coloringPages = updated
            .filter((p) => p.status === "done" && p.r2Url)
            .map((p) => ({
              id: p.id,
              url: p.r2Url!,
              isPublic: false,
              prompt: p.prompt || "",
              characterReferenceImageUrls: p.characterReferenceImageUrls || [],
              locationReferenceImageUrls: p.locationReferenceImageUrls || [],
            }));

          firestoreUpdate(firestore, "books", bookId, {
            coloringPages,
            specifications: { pages: coloringPages.length },
          }).catch(() => {});

          return updated;
        });
      } catch {
        setGeneratedPages((prev) =>
          prev.map((p, i) => (i === index ? { ...p, status: "error" } : p)),
        );
      }
    },
    [firestore, bookId, generatedPages],
  );

  async function generateAllPages() {
    setGeneratingAll(true);
    for (let i = 0; i < generatedPages.length; i++) {
      if (generatedPages[i].status !== "done") {
        await generateSinglePage(i);
      }
    }
    setGeneratingAll(false);
    notify.success("All pages generated!");
  }

  // --- Step 4: Cover/thumbnail saved by CoverThumbnailStep ---
  const handleCoverSave = useCallback(
    async (data: { coverPreview: string | null; squarePreview: string | null }) => {
      if (!firestore || !bookId) return;
      setStepSaving(true);
      try {
        const updates: Record<string, unknown> = { status: "complete" };

        // Upload square thumbnail
        let squareUrl: string | null = null;
        if (data.squarePreview) {
          squareUrl = await uploadBase64ToR2(data.squarePreview, `assets/${bookId}/square.png`);
          if (squareUrl) updates.squareThumbnailUrl = squareUrl;
        }

        // Upload cover (or fall back to square thumbnail)
        if (data.coverPreview) {
          const url = await uploadBase64ToR2(data.coverPreview, `assets/${bookId}/cover.png`);
          if (url) updates.coverUrl = url;
        } else if (squareUrl) {
          updates.coverUrl = squareUrl;
        }

        // Thumbnail always same as square (both are 1:1 from coloring pages)
        if (squareUrl) {
          updates.thumbnailUrl = squareUrl;
        }

        await firestoreUpdate(firestore, "books", bookId, updates);
        notify.success("Book complete!");
        router.push(`/books/${bookId}`);
      } catch (err) {
        console.error("Failed to save cover:", err);
        notify.error("Failed to save cover data");
      } finally {
        setStepSaving(false);
      }
    },
    [firestore, bookId, router],
  );

  const donePages = generatedPages.filter((p) => p.status === "done").length;

  if (loadingDraft) {
    return (
      <div className="flex h-64 items-center justify-center">
        <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-5 w-5 text-muted-foreground" />
        <span className="text-muted-foreground">Loading draft…</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">Create New Book</h1>
        {bookId && (
          <span className="text-xs text-muted-foreground ml-auto">
            Draft saved • ID: {bookId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Split layout */}
      <div className="flex gap-6">
        {/* LEFT: Steps */}
        <div className="w-[240px] shrink-0 space-y-2 self-start sticky top-4">
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Step <span className="font-medium text-foreground">{currentStep + 1}</span> of{" "}
                {STEPS.length}
              </span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {STEPS.map((step, i) => {
            const stepIcon = step.icon;
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            return (
              <button
                key={step.title}
                type="button"
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all",
                  isActive && "border-primary/40 bg-primary/5 shadow-sm",
                  isCompleted && "border-green-200 bg-green-50/50 cursor-pointer",
                  !isActive && !isCompleted && "border-transparent opacity-40 cursor-default",
                )}
              >
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    isCompleted && "bg-green-500 text-white",
                    isActive && "bg-primary text-primary-foreground",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground",
                  )}
                >
                  {isCompleted ? (
                    <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isCompleted && "text-muted-foreground line-through",
                      isActive && "text-foreground",
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    {step.description}
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={stepIcon}
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/30",
                  )}
                />
              </button>
            );
          })}

          {bookId && (
            <div className="pt-4">
              <Button
                variant="outline"
                className="w-full text-xs"
                onClick={() => router.push(`/books/${bookId}`)}
              >
                View Draft →
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT: Content */}
        <div className="min-w-0 flex-1">
          <Card>
            <CardContent className="p-6">
              {/* ========== Step 0: Category & Story Idea ========== */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Category & Story Idea</h2>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Category *</Label>
                    <Combobox
                      options={categories.map((cat) => ({
                        value: cat.id,
                        label: cat.displayName,
                        icon: cat.iconUrl ? (
                          <img
                            src={resolveUrl(cat.iconUrl)}
                            alt=""
                            className="h-5 w-5 rounded object-cover"
                          />
                        ) : undefined,
                      }))}
                      value={draft.categoryId}
                      onValueChange={(val) => {
                        const cat = categories.find((c) => c.id === val);
                        updateDraft("categoryId", val);
                        if (cat) updateDraft("category", cat.name || cat.displayName);
                      }}
                      placeholder="Select a category"
                      searchPlaceholder="Search categories..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Badge</Label>
                    <Combobox
                      options={[
                        { value: "NEW", label: "NEW" },
                        { value: "HOT", label: "HOT" },
                        { value: "SALE", label: "SALE" },
                      ]}
                      value={draft.badge}
                      onValueChange={(val) => updateDraft("badge", val)}
                      placeholder="None"
                      searchPlaceholder="Search badges..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Story Idea / Short Description</Label>
                    <Textarea
                      value={draft.storyIdea}
                      onChange={(e) => updateDraft("storyIdea", e.target.value)}
                      placeholder="A cozy adventure of forest animals having a tea party in autumn... (this will be used to AI-generate title, subtitle, and description in the next step)"
                      rows={4}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Describe your book idea briefly. The AI will generate title, subtitle, and
                      full description from this.
                    </p>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleStep0Next} disabled={!canProceed() || stepSaving}>
                      {stepSaving ? (
                        <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
                      ) : null}
                      {stepSaving ? "Creating..." : "Next →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* ========== Step 1: Basic Info (AI-assisted) ========== */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Basic Information</h2>
                    {(draft.category || draft.storyIdea) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateBasicInfo}
                        disabled={generatingBasicInfo}
                      >
                        {generatingBasicInfo ? (
                          <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {generatingBasicInfo ? "Generating..." : "Generate with AI"}
                      </Button>
                    )}
                  </div>
                  {draft.storyIdea && (
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      <span className="font-medium">Story idea:</span> {draft.storyIdea}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Title *</Label>
                    <Input
                      value={draft.title}
                      onChange={(e) => updateDraft("title", e.target.value)}
                      placeholder="50 Animals Coloring Book"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Subtitle</Label>
                    <Input
                      value={draft.subtitle}
                      onChange={(e) => updateDraft("subtitle", e.target.value)}
                      placeholder="Animal Mandalas"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Description</Label>
                    <Textarea
                      value={draft.description}
                      onChange={(e) => updateDraft("description", e.target.value)}
                      placeholder="A beautiful coloring book featuring..."
                      rows={4}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Price</Label>
                    <Input
                      value={draft.price}
                      onChange={(e) => updateDraft("price", e.target.value)}
                      placeholder="7.99"
                    />
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setCurrentStep(0)}>
                      ← Back
                    </Button>
                    <Button onClick={handleStep1Next} disabled={!canProceed() || stepSaving}>
                      {stepSaving ? (
                        <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
                      ) : null}
                      {stepSaving ? "Saving..." : "Next →"}
                    </Button>
                  </div>
                </div>
              )}

              {/* ========== Step 2: Story Planner ========== */}
              {currentStep === 2 && (
                <StoryPlannerStep
                  title={draft.title}
                  description={draft.description}
                  onBack={() => setCurrentStep(1)}
                  onNext={(prompts, scenePrompts) => {
                    initGeneratedPagesFromPrompts(prompts, scenePrompts);
                    setCurrentStep(3);
                  }}
                />
              )}

              {/* ========== Step 3: Generate Pages ========== */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Generate Coloring Pages</h2>
                    <Button size="sm" onClick={generateAllPages} disabled={generatingAll}>
                      {generatingAll ? (
                        <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {generatingAll ? "Generating..." : `Generate All (${generatedPages.length})`}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {donePages} of {generatedPages.length} pages generated
                    <span className="ml-2 text-xs">(each page is auto-saved to cloud)</span>
                  </p>
                  <div className="space-y-3">
                    {generatedPages.map((page, i) => (
                      <div key={page.id} className="flex gap-3 rounded-lg border p-3">
                        {/* Preview */}
                        <div className="h-20 w-16 shrink-0 overflow-hidden rounded border bg-muted">
                          {page.previewUrl ? (
                            <img
                              src={page.previewUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : page.status === "generating" || page.status === "uploading" ? (
                            <div className="flex h-full items-center justify-center">
                              <FontAwesomeIcon
                                icon={faSpinner}
                                spin
                                className="h-4 w-4 text-muted-foreground"
                              />
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                              {page.status === "error" ? "Error" : "Pending"}
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium">Page {i + 1}</p>
                            {page.status === "uploading" && (
                              <span className="text-[10px] text-blue-500">Uploading…</span>
                            )}
                            {page.status === "done" && page.r2Url && (
                              <span className="text-[10px] text-green-600">✓ Saved</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                            {page.prompt}
                          </p>
                        </div>
                        {/* Actions */}
                        <div className="flex shrink-0 items-start gap-1">
                          {page.status !== "generating" && page.status !== "uploading" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => generateSinglePage(i)}
                            >
                              <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setCurrentStep(2)}>
                      ← Back
                    </Button>
                    <Button onClick={() => setCurrentStep(4)}>Next →</Button>
                  </div>
                </div>
              )}

              {/* ========== Step 4: Cover & Thumbnails ========== */}
              {currentStep === 4 && (
                <CoverThumbnailStep
                  generatedPages={generatedPages}
                  title={draft.title}
                  bookId={bookId}
                  onBack={() => setCurrentStep(3)}
                  onSave={handleCoverSave}
                  saving={stepSaving}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
