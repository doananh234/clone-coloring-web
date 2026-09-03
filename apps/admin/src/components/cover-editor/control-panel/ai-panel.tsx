"use client";
import React, { useState } from "react";
import { Button, Input, Label } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSparkles, faSpinner, faCheck, faXmark } from "@fortawesome/pro-regular-svg-icons";

interface AiPanelProps {
  bookId: string;
  /**
   * URL of the CLEAN colored illustration (no text) — passed straight to the
   * image-edit model. Same URL Cover Editor uses as the canvas background.
   */
  backgroundImageUrl: string;
  /**
   * Default brand line text. The user can override before generating.
   * Sent to the LLM as the verbatim brand name to render at the bottom.
   */
  defaultBrandName: string;
  /** Called when the user accepts a generated preview. */
  onAccept: (aiCoverUrl: string) => void;
  /** Currently-accepted AI cover URL, if any. */
  currentAiCoverUrl: string | null;
}

interface PreviewState {
  previewUrl: string;
  url: string;
}

/**
 * "Generate Cover with AI" flow — replaces the older scene-blend approach.
 *
 * Server-side pipeline (in /api/generate/cover-export with aiBlend=true):
 *   1. Take the CLEAN illustration URL + brand name from the request body.
 *   2. Call editImage(cleanIllustration, buildCoverTypographyPrompt(brand)).
 *   3. The image-edit model analyzes the illustration, invents a fitting
 *      title (1–3 words) and subtitle (2–6 words, "…Coloring Book"),
 *      renders all three text roles with the KDP-style typography spec,
 *      and returns the composed cover.
 *   4. Upload to R2 (assets/books/{bookId}/cover-ai.png), return url + base64.
 *
 * Client: user picks a brand name, hits Generate, previews, accepts or discards.
 */
// Image model choices for cover generation. "" = Auto (provider default,
// LITELLM_IMAGE_MODEL). gpt-image-2 lays out top/mid/bottom text more reliably
// than gemini-3.1-flash-image, so operators can pick per-cover.
const COVER_MODELS: { label: string; value: string }[] = [
  { label: "Auto (mặc định)", value: "" },
  { label: "gpt-image-2", value: "gpt-image-2" },
  { label: "Gemini 3.1", value: "gemini-3.1-flash-image" },
];

export function AiPanel(props: AiPanelProps) {
  const [brand, setBrand] = useState(props.defaultBrandName);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep brand in sync when the parent scene's brand slot changes.
  React.useEffect(() => {
    if (!preview && !loading) setBrand(props.defaultBrandName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.defaultBrandName]);

  async function handleGenerate() {
    if (!brand.trim()) {
      setError("Brand name is required — enter one before generating.");
      return;
    }
    if (!props.backgroundImageUrl) {
      setError("Illustration URL is missing — can't generate.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate/cover-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: props.bookId,
          backgroundImageUrl: props.backgroundImageUrl,
          brandName: brand.trim(),
          aiBlend: true,
          ...(model ? { model } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }
      const { url, base64 } = (await res.json()) as { url: string; base64: string };
      setPreview({ previewUrl: `data:image/png;base64,${base64}`, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (!preview) return;
    props.onAccept(preview.url);
    setPreview(null);
  }

  function handleDiscard() {
    setPreview(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs font-bold uppercase tracking-wide">AI Generate</Label>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Sends the CLEAN illustration + your brand name to the image model.
          The model analyzes the artwork, invents a title and subtitle in the
          Amazon KDP coloring-book style, and renders all three text roles
          directly onto the cover. Takes 30–60 seconds.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Brand</Label>
        <Input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. iroly"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Image model</Label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {COVER_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {props.currentAiCoverUrl && !preview && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-[11px] text-emerald-700">
          Using AI-generated cover. Save Cover will persist it. Generate again
          to replace, or click Discard below the preview to fall back to the raw
          scene.
        </div>
      )}

      <Button onClick={handleGenerate} disabled={loading} className="w-full">
        {loading ? (
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3.5 w-3.5" />
        ) : (
          <FontAwesomeIcon icon={faSparkles} className="mr-2 h-3.5 w-3.5" />
        )}
        {loading ? "Generating with AI…" : "Generate Cover with AI"}
      </Button>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
          {error}
        </p>
      )}

      {preview && (
        <div className="space-y-2">
          <Label className="text-[10px] text-muted-foreground">Preview</Label>
          <img
            src={preview.previewUrl}
            alt="AI-generated cover preview"
            className="w-full aspect-square rounded-md border object-cover"
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleAccept}>
              <FontAwesomeIcon icon={faCheck} className="mr-1.5 h-3.5 w-3.5" />
              Use this cover
            </Button>
            <Button size="sm" variant="outline" onClick={handleDiscard}>
              <FontAwesomeIcon icon={faXmark} className="mr-1.5 h-3.5 w-3.5" />
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
