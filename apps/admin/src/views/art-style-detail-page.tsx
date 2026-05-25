"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@vx/core-uikit/components";
import { ConfirmDialog } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faTrash,
  faCopy,
  faPencil,
  faRotate,
  faPalette,
  faSparkles,
  faSpinner,
} from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}
import { Input, Textarea } from "@vx/core-uikit/components";
import { PreviewableImage } from "@/components/global-image-preview";
import { appNavigate } from "@/lib/navigate";
import type { ArtStyleEntity } from "@/lib/ai/art-style-types";

// --- Helpers ---

const COMPLEXITY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  veryHigh: "bg-red-100 text-red-700",
};

function complexityBadge(score: number): { label: string; color: string } {
  if (score <= 3) return { label: `Complexity: ${score}/10`, color: COMPLEXITY_COLORS.low };
  if (score <= 5) return { label: `Complexity: ${score}/10`, color: COMPLEXITY_COLORS.medium };
  if (score <= 7) return { label: `Complexity: ${score}/10`, color: COMPLEXITY_COLORS.high };
  return { label: `Complexity: ${score}/10`, color: COMPLEXITY_COLORS.veryHigh };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => notify.success("Copied to clipboard"),
    () => notify.error("Failed to copy"),
  );
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// --- PropertyGroup sub-component ---

function PropertyGroup({
  title,
  properties,
  description,
}: {
  title: string;
  properties: Record<string, string | number | undefined>;
  description?: string;
}) {
  const entries = Object.entries(properties).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0 && !description) return null;

  return (
    <DetailCard title={title}>
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, val]) => (
            <Badge key={key} variant="secondary" className="text-xs">
              {formatKey(key)}: {val}
            </Badge>
          ))}
        </div>
      )}
      {description && <p className="mt-2 text-sm italic text-muted-foreground">{description}</p>}
    </DetailCard>
  );
}

// --- Component ---

export function ArtStyleDetailPage({ artStyleId }: { artStyleId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testPrompt, setTestPrompt] = useState("A cute cat sitting on a mushroom in a forest");
  const [testGenerating, setTestGenerating] = useState(false);
  const [testResultUrl, setTestResultUrl] = useState<string | null>(null);
  const [testFullPrompt, setTestFullPrompt] = useState<string | null>(null);

  const { data: artStyle, isLoading } = useQuery<ArtStyleEntity>({
    queryKey: ["artStyles", artStyleId],
    queryFn: () => fetch(`/api/art-styles/${artStyleId}`).then((r) => r.json()),
    enabled: !!artStyleId,
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/art-styles/${artStyleId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Art style deleted");
        queryClient.invalidateQueries({ queryKey: ["artStyles"] });
        appNavigate("/art-styles");
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete art style");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRegenerateDirective() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/art-styles/${artStyleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateDirective: true }),
      });
      const data = await res.json();
      if (data.success !== false) {
        notify.success("Generation directive regenerated");
        queryClient.invalidateQueries({ queryKey: ["artStyles", artStyleId] });
      } else {
        notify.error(data.error || "Failed to regenerate");
      }
    } catch {
      notify.error("Failed to regenerate directive");
    } finally {
      setRegenerating(false);
    }
  }

  function buildFullPrompt(): string {
    if (!artStyle) return testPrompt;
    const directive = artStyle.generationDirective;
    if (directive) {
      return `STYLE RULES (follow exactly): ${directive}\n\nSCENE TO DRAW: ${testPrompt}\n\nOUTPUT: Black and white line art coloring book page, no shading, no color fill, white background. Follow the STYLE RULES above precisely for all line weights, shapes, and details.`;
    }
    return `${testPrompt}. Black and white line art, coloring book page, clean outlines, no shading, no color fill, white background, suitable for coloring.`;
  }

  async function handleTestGenerate() {
    if (!testPrompt.trim() || !artStyle) return;
    const fullPrompt = buildFullPrompt();
    setTestFullPrompt(fullPrompt);
    setTestGenerating(true);
    setTestResultUrl(null);
    try {
      const res = await fetch("/api/art-styles/test-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: testPrompt,
          generationDirective: artStyle.generationDirective,
          referenceImageUrls: artStyle.referenceImages?.map((r) => r.url) || [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResultUrl(data.dataUrl);
      } else {
        notify.error(data.error || "Test generation failed");
      }
    } catch {
      notify.error("Test generation failed");
    } finally {
      setTestGenerating(false);
    }
  }

  if (isLoading || !artStyle) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const complexity = complexityBadge(artStyle.technical?.complexityScore ?? 5);

  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{artStyle.name}</h1>
          {artStyle.moodAndAtmosphere?.mood && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {artStyle.moodAndAtmosphere.mood}
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${complexity.color}`}>
            {complexity.label}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appNavigate(`/art-styles/${artStyleId}/edit`)}
          >
            <FontAwesomeIcon icon={faPencil} className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <FontAwesomeIcon icon={faTrash} className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Description */}
      {artStyle.description && (
        <p className="mb-4 ml-11 text-sm text-muted-foreground">{artStyle.description}</p>
      )}

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT PANEL -- Sticky Media */}
        <div className="w-[300px] shrink-0 space-y-4 self-start sticky top-4">
          {artStyle.referenceImages?.length > 0 ? (
            artStyle.referenceImages.map((img, idx) => (
              <div key={idx}>
                {img.label && (
                  <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                    {img.label}
                  </p>
                )}
                <div className="overflow-hidden rounded-lg border">
                  <PreviewableImage
                    src={resolveUrl(img.url)}
                    alt={img.label || `Reference ${idx + 1}`}
                    className="w-full object-cover"
                    style={{ maxHeight: 280 }}
                  />
                </div>
              </div>
            ))
          ) : artStyle.thumbnailUrl ? (
            <div className="overflow-hidden rounded-lg border">
              <PreviewableImage
                src={resolveUrl(artStyle.thumbnailUrl)}
                alt={artStyle.name}
                className="w-full object-cover"
                style={{ maxHeight: 280 }}
              />
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <FontAwesomeIcon icon={faPalette} className="h-12 w-12 opacity-30" />
            </div>
          )}

          {/* Test Generate */}
          <div className="rounded-lg border p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Test Generate</h3>
            <Textarea
              rows={2}
              value={testPrompt}
              onChange={(e) => {
                setTestPrompt(e.target.value);
                setTestFullPrompt(null);
              }}
              placeholder="Describe a scene to test..."
              className="text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={testGenerating || !testPrompt.trim()}
              onClick={handleTestGenerate}
            >
              {testGenerating ? (
                <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
              )}
              {testGenerating ? "Generating..." : "Generate Test Page"}
            </Button>
            {testFullPrompt && (
              <details className="text-xs" open>
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Full prompt sent to AI
                </summary>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">
                  {testFullPrompt}
                </pre>
              </details>
            )}
            {testResultUrl && (
              <div className="overflow-hidden rounded-lg border">
                <PreviewableImage
                  src={testResultUrl}
                  alt="Test generation result"
                  className="w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL -- Scrollable Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Line Work */}
          <PropertyGroup
            title="Line Work"
            properties={{
              strokeWeight:
                artStyle.lineWork?.strokeWeight != null
                  ? `${artStyle.lineWork.strokeWeight}px`
                  : undefined,
              lineQuality: artStyle.lineWork?.lineQuality,
              lineVariation: artStyle.lineWork?.lineVariation,
              outlineStyle: artStyle.lineWork?.outlineStyle,
              hatchingPattern: artStyle.lineWork?.hatchingPattern,
            }}
            description={artStyle.lineWork?.description}
          />

          {/* Composition */}
          <PropertyGroup
            title="Composition"
            properties={{
              density: artStyle.composition?.density,
              symmetry: artStyle.composition?.symmetry,
              framingStyle: artStyle.composition?.framingStyle,
              negativeSpace: artStyle.composition?.negativeSpace,
              focalPoint: artStyle.composition?.focalPoint,
            }}
            description={artStyle.composition?.description}
          />

          {/* Form & Shape */}
          <PropertyGroup
            title="Form & Shape"
            properties={{
              shapeLanguage: artStyle.formAndShape?.shapeLanguage,
              edgeTreatment: artStyle.formAndShape?.edgeTreatment,
              proportionStyle: artStyle.formAndShape?.proportionStyle,
              detailLevel: artStyle.formAndShape?.detailLevel,
            }}
            description={artStyle.formAndShape?.description}
          />

          {/* Mood & Atmosphere */}
          <PropertyGroup
            title="Mood & Atmosphere"
            properties={{
              mood: artStyle.moodAndAtmosphere?.mood,
              energyLevel: artStyle.moodAndAtmosphere?.energyLevel,
              ageTarget: artStyle.moodAndAtmosphere?.ageTarget,
              themeCategory: artStyle.moodAndAtmosphere?.themeCategory,
            }}
            description={artStyle.moodAndAtmosphere?.description}
          />

          {/* Pattern & Texture */}
          <PropertyGroup
            title="Pattern & Texture"
            properties={{
              fillPattern: artStyle.patternAndTexture?.fillPattern,
              backgroundTreatment: artStyle.patternAndTexture?.backgroundTreatment,
              decorativeElements: artStyle.patternAndTexture?.decorativeElements,
              borderStyle: artStyle.patternAndTexture?.borderStyle,
            }}
            description={artStyle.patternAndTexture?.description}
          />

          {/* Technical */}
          <PropertyGroup
            title="Technical"
            properties={{
              orientation: artStyle.technical?.orientation,
              complexityScore: artStyle.technical?.complexityScore,
              estimatedColoringTime: artStyle.technical?.estimatedColoringTime,
            }}
            description={artStyle.technical?.description}
          />

          {/* Generation Directive */}
          {artStyle.generationDirective && (
            <DetailCard
              title="Generation Directive"
              actions={
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(artStyle.generationDirective)}
                  >
                    <FontAwesomeIcon icon={faCopy} className="mr-1 h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={regenerating}
                    onClick={handleRegenerateDirective}
                  >
                    <FontAwesomeIcon
                      icon={faRotate}
                      spin={regenerating}
                      className="mr-1 h-3.5 w-3.5"
                    />
                    {regenerating ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
              }
            >
              <div className="rounded-md bg-muted p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {artStyle.generationDirective}
                </p>
              </div>
            </DetailCard>
          )}

          {/* Tags */}
          {artStyle.tags?.length > 0 && (
            <DetailCard title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {artStyle.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </DetailCard>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Art Style"
        description={`Delete "${artStyle.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
