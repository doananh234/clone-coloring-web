"use client";

import { useState, useCallback, useEffect } from "react";
import { Button, Dialog, DialogContent, Label } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSparkles, faWandMagicSparkles } from "@fortawesome/pro-regular-svg-icons";
import { ColoringStylePicker } from "@/components/coloring-style-picker";

interface EditCoverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onApply: (base64: string, previewUrl: string) => void;
}

const PROMPT_SUGGESTIONS: string[] = [
  'Change the brand name to "Zenith"',
  "Replace the cat with a puppy",
  "Change the title color to warm orange",
  "Remove the small logo in the bottom-right",
];

/**
 * Edit Cover Editor.
 *
 * Deliberately distinct from TextOverlayModal:
 *   - TextOverlayModal = deterministic canvas draw of a header/footer, then optional AI blend.
 *   - EditCoverModal   = free-form "keep everything, change ONLY this" edit via /api/generate/edit-cover.
 *
 * Server-side prompt (see edit-cover/route.ts) preserves composition/style and always
 * strips any border/frame the original cover may have.
 */
export function EditCoverModal({
  open,
  onOpenChange,
  imageUrl,
  onApply,
}: EditCoverModalProps) {
  const [userPrompt, setUserPrompt] = useState("");
  const [coloringStyleId, setColoringStyleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUserPrompt("");
      setColoringStyleId(null);
      setBusy(false);
      setPreviewUrl(null);
      setPreviewBase64(null);
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    const trimmed = userPrompt.trim();
    if (!trimmed) {
      notify.error("Please describe what to change");
      return;
    }
    if (!imageUrl) {
      notify.error("No cover image to edit");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/generate/edit-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, userPrompt: trimmed, coloringStyleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify.error(data.error || "Edit failed");
        return;
      }
      setPreviewUrl(data.previewUrl);
      setPreviewBase64(data.base64);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Edit failed");
    } finally {
      setBusy(false);
    }
  }, [imageUrl, userPrompt, coloringStyleId]);

  const handleApply = useCallback(() => {
    if (!previewBase64 || !previewUrl) return;
    onApply(previewBase64, previewUrl);
    onOpenChange(false);
  }, [previewBase64, previewUrl, onApply, onOpenChange]);

  const handleTryAgain = useCallback(() => {
    setPreviewUrl(null);
    setPreviewBase64(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <div className="mb-4 flex items-center gap-2">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Edit Cover</h2>
          <span className="text-xs text-muted-foreground">
            Describe only what to change — everything else stays the same.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: Original vs Preview */}
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-xs uppercase text-muted-foreground">
                {previewUrl ? "Preview (edited)" : "Current cover"}
              </Label>
              <div className="overflow-hidden rounded-lg border bg-muted">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full object-contain"
                    style={{ maxHeight: 420 }}
                  />
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Current cover"
                    className="w-full object-contain"
                    style={{ maxHeight: 420 }}
                  />
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                    No cover
                  </div>
                )}
              </div>
            </div>
            {previewUrl && (
              <p className="text-xs text-muted-foreground">
                Compare the preview with the original before applying. Preview looks off?
                Refine your request and generate again.
              </p>
            )}
          </div>

          {/* RIGHT: Prompt + controls */}
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-xs uppercase text-muted-foreground">
                Color style <span className="text-muted-foreground/70 normal-case">(optional)</span>
              </Label>
              <ColoringStylePicker
                value={coloringStyleId}
                onChange={(id) => setColoringStyleId(id)}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Pick a style to guide the palette and technique of your edit. Leave empty to keep the current colors.
              </p>
            </div>

            <div>
              <Label
                htmlFor="edit-cover-prompt"
                className="mb-1.5 block text-xs uppercase text-muted-foreground"
              >
                What should change?
              </Label>
              <textarea
                id="edit-cover-prompt"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                disabled={busy}
                placeholder='e.g. Change the brand name from "Acme" to "Zenith"'
                rows={5}
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Any border on the original cover will be removed automatically.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase text-muted-foreground">Examples</p>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setUserPrompt(s)}
                    disabled={busy}
                    className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {!previewUrl ? (
                <Button onClick={handleGenerate} disabled={busy || !userPrompt.trim()}>
                  {busy ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} className="mr-2 h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSparkles} className="mr-2 h-4 w-4" />
                      Generate edit
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button onClick={handleApply} disabled={busy}>
                    Apply & save
                  </Button>
                  <Button variant="outline" onClick={handleTryAgain} disabled={busy}>
                    Discard & edit prompt
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
