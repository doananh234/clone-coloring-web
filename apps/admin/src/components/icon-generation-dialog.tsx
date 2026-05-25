"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Textarea,
  Label,
} from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSparkles, faUpload, faRotate } from "@fortawesome/pro-regular-svg-icons";

type IconGenerationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  currentPrompt?: string;
  onIconUploaded: () => void;
};

export function IconGenerationDialog({
  open,
  onOpenChange,
  categoryId,
  currentPrompt,
  onIconUploaded,
}: IconGenerationDialogProps) {
  const [prompt, setPrompt] = useState(currentPrompt || "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setPreviewUrl(null);
    try {
      const res = await fetch("/api/categories/generate-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, action: "generate" }),
      });
      const data = await res.json();
      if (data.success) {
        setPreviewUrl(data.previewUrl);
        setBase64Data(data.base64);
      } else {
        notify.error(data.error || "Generation failed");
      }
    } catch {
      notify.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpload() {
    if (!base64Data) return;
    setUploading(true);
    try {
      const res = await fetch("/api/categories/generate-icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          categoryId,
          previewBase64: base64Data,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success("Icon uploaded successfully");
        onIconUploaded();
        onOpenChange(false);
        setPreviewUrl(null);
        setBase64Data(null);
      } else {
        notify.error(data.error || "Upload failed");
      }
    } catch {
      notify.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Category Icon</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the icon you want..."
              rows={3}
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="w-full"
          >
            {generating ? (
              <FontAwesomeIcon icon={faRotate} spin className="mr-2 h-4 w-4" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="mr-2 h-4 w-4" />
            )}
            {generating ? "Generating..." : "Generate Preview"}
          </Button>
          {previewUrl && (
            <div className="flex flex-col items-center gap-3">
              <div className="overflow-hidden rounded-lg border">
                <img
                  src={previewUrl}
                  alt="Generated icon preview"
                  className="h-48 w-48 object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                  <FontAwesomeIcon
                    icon={faRotate}
                    spin={generating}
                    className="mr-1.5 h-3.5 w-3.5"
                  />
                  Regenerate
                </Button>
                <Button size="sm" onClick={handleUpload} disabled={uploading}>
                  <FontAwesomeIcon icon={faUpload} className="mr-1.5 h-3.5 w-3.5" />
                  {uploading ? "Uploading..." : "Use This Icon"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
