"use client";

import { useState, useRef } from "react";
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
  faDroplet,
  faSpinner,
} from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";
import { PreviewableImage } from "@/components/global-image-preview";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}
import { buildColorizationPrompt } from "@/lib/ai/colorization-prompt-template";
import { appNavigate } from "@/lib/navigate";
import type { ColoringStyleEntity } from "@/lib/ai/coloring-style-types";

// --- Helpers ---

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
  extraContent,
}: {
  title: string;
  properties: Record<string, string | number | undefined>;
  description?: string;
  extraContent?: React.ReactNode;
}) {
  const entries = Object.entries(properties).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0 && !description && !extraContent) return null;

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
      {extraContent}
      {description && <p className="mt-2 text-sm italic text-muted-foreground">{description}</p>}
    </DetailCard>
  );
}

// --- Color swatches display ---

function ColorSwatches({ label, colors }: { label: string; colors: string[] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <div className="mt-2">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {colors.map((color, i) => (
          <div key={i} className="flex items-center gap-1">
            <span
              className="inline-block h-5 w-5 rounded-full border border-border"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] text-muted-foreground">{color}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Component ---

export function ColoringStyleDetailPage({ coloringStyleId }: { coloringStyleId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testImage, setTestImage] = useState<string | null>(null);
  const [testColorizing, setTestColorizing] = useState(false);
  const [testResultUrl, setTestResultUrl] = useState<string | null>(null);
  const [testFullPrompt, setTestFullPrompt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: style, isLoading } = useQuery<ColoringStyleEntity>({
    queryKey: ["coloringStyles", coloringStyleId],
    queryFn: () => fetch(`/api/coloring-styles/${coloringStyleId}`).then((r) => r.json()),
    enabled: !!coloringStyleId,
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/coloring-styles/${coloringStyleId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Coloring style deleted");
        queryClient.invalidateQueries({ queryKey: ["coloringStyles"] });
        appNavigate("/coloring-styles");
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete coloring style");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRegenerateDirective() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/coloring-styles/${coloringStyleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateDirective: true }),
      });
      const data = await res.json();
      if (data.success !== false) {
        notify.success("Colorization directive regenerated");
        queryClient.invalidateQueries({ queryKey: ["coloringStyles", coloringStyleId] });
      } else {
        notify.error(data.error || "Failed to regenerate");
      }
    } catch {
      notify.error("Failed to regenerate directive");
    } finally {
      setRegenerating(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTestImage(ev.target?.result as string);
      setTestResultUrl(null);
      setTestFullPrompt(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleTestColorize() {
    if (!testImage || !style) return;
    setTestColorizing(true);
    setTestResultUrl(null);
    setTestFullPrompt(
      style.colorizationDirective ? buildColorizationPrompt(style.colorizationDirective) : null,
    );
    try {
      const res = await fetch("/api/coloring-styles/test-colorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: testImage,
          colorizationDirective: style.colorizationDirective,
          referenceImageUrls: style.referenceImages?.map((r: { url: string }) => r.url) || [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResultUrl(data.dataUrl);
      } else {
        notify.error(data.error || "Test colorization failed");
      }
    } catch {
      notify.error("Test colorization failed");
    } finally {
      setTestColorizing(false);
    }
  }

  if (isLoading || !style) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{style.name}</h1>
          {style.medium?.technique && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {style.medium.technique}
            </span>
          )}
          {style.overallFeel?.mood && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {style.overallFeel.mood}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => appNavigate(`/coloring-styles/${coloringStyleId}/edit`)}
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
      {style.description && (
        <p className="mb-4 ml-11 text-sm text-muted-foreground">{style.description}</p>
      )}

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT PANEL -- Sticky Media */}
        <div className="w-[300px] shrink-0 space-y-4 self-start sticky top-4">
          {style.referenceImages?.length > 0 ? (
            style.referenceImages.map((img, idx) => (
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
          ) : style.thumbnailUrl ? (
            <div className="overflow-hidden rounded-lg border">
              <PreviewableImage
                src={resolveUrl(style.thumbnailUrl)}
                alt={style.name}
                className="w-full object-cover"
                style={{ maxHeight: 280 }}
              />
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <FontAwesomeIcon icon={faDroplet} className="h-12 w-12 opacity-30" />
            </div>
          )}

          {/* Test Colorize */}
          <div className="rounded-lg border p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Test Colorize</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            {testImage ? (
              <div className="relative overflow-hidden rounded-lg border">
                <img src={testImage} alt="B&W input" className="w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setTestImage(null);
                    setTestResultUrl(null);
                    setTestFullPrompt(null);
                  }}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center rounded-lg border-2 border-dashed py-6 text-muted-foreground hover:border-primary/50 transition-colors"
              >
                <span className="text-sm">Upload B&W image</span>
              </button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={testColorizing || !testImage}
              onClick={handleTestColorize}
            >
              {testColorizing ? (
                <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <FontAwesomeIcon icon={faDroplet} className="mr-1.5 h-3.5 w-3.5" />
              )}
              {testColorizing ? "Colorizing..." : "Colorize"}
            </Button>
            {testFullPrompt && (
              <details className="text-xs" open>
                <summary className="cursor-pointer font-medium text-muted-foreground">
                  Colorization directive
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
                  alt="Test colorization result"
                  className="w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL -- Scrollable Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Medium */}
          <PropertyGroup
            title="Medium"
            properties={{
              technique: style.medium?.technique,
              texture: style.medium?.texture,
            }}
            description={style.medium?.description}
          />

          {/* Color Palette */}
          <PropertyGroup
            title="Color Palette"
            properties={{
              backgroundTone: style.colorPalette?.backgroundTone,
              warmth: style.colorPalette?.warmth,
              saturation: style.colorPalette?.saturation,
            }}
            description={style.colorPalette?.description}
            extraContent={
              <>
                <ColorSwatches
                  label="Primary Colors"
                  colors={style.colorPalette?.primaryColors ?? []}
                />
                <ColorSwatches
                  label="Accent Colors"
                  colors={style.colorPalette?.accentColors ?? []}
                />
              </>
            }
          />

          {/* Shading & Lighting */}
          <PropertyGroup
            title="Shading & Lighting"
            properties={{
              shadingStyle: style.shadingAndLighting?.shadingStyle,
              lightDirection: style.shadingAndLighting?.lightDirection,
              highlightTreatment: style.shadingAndLighting?.highlightTreatment,
              shadowColorTendency: style.shadingAndLighting?.shadowColorTendency,
            }}
            description={style.shadingAndLighting?.description}
          />

          {/* Fill Behavior */}
          <PropertyGroup
            title="Fill Behavior"
            properties={{
              edgeBleed: style.fillBehavior?.edgeBleed,
              opacity: style.fillBehavior?.opacity,
              coverage: style.fillBehavior?.coverage,
            }}
            description={style.fillBehavior?.description}
          />

          {/* Overall Feel */}
          <PropertyGroup
            title="Overall Feel"
            properties={{
              mood: style.overallFeel?.mood,
              ageFeel: style.overallFeel?.ageFeel,
              finish: style.overallFeel?.finish,
            }}
            description={style.overallFeel?.description}
          />

          {/* Colorization Directive */}
          {style.colorizationDirective && (
            <DetailCard
              title="Colorization Directive"
              actions={
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(style.colorizationDirective)}
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
                  {style.colorizationDirective}
                </p>
              </div>
            </DetailCard>
          )}

          {/* Tags */}
          {style.tags?.length > 0 && (
            <DetailCard title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {style.tags.map((tag) => (
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
        title="Delete Coloring Style"
        description={`Delete "${style.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
