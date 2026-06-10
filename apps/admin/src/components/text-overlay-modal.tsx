"use client";

import { useState, useCallback, useEffect } from "react";
import { Button, Dialog, DialogContent, Input, Label } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { cn } from "@vx/core-uikit/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSparkles, faFont, faChevronDown, faChevronUp } from "@fortawesome/pro-regular-svg-icons";
import { TEXT_PRESETS, FONT_CATALOG, DEFAULT_PRESET_ID } from "@/lib/text-overlay/text-overlay-presets";
import type { TextBlockConfig, TextPreset } from "@/lib/text-overlay/text-overlay-types";

interface TextOverlayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  defaultTitle?: string;
  onApply: (base64: string, previewUrl: string) => void;
}

const DEFAULT_HEADER: TextBlockConfig = {
  text: "",
  fontFamily: TEXT_PRESETS[0].fontFamily,
  color: TEXT_PRESETS[0].color,
  outlineColor: TEXT_PRESETS[0].outlineColor,
  outlineWidth: TEXT_PRESETS[0].outlineWidth,
  shadow: TEXT_PRESETS[0].shadow,
  position: "top",
  scale: 1,
};

const DEFAULT_FOOTER: TextBlockConfig = {
  text: "",
  fontFamily: TEXT_PRESETS[0].fontFamily,
  color: TEXT_PRESETS[0].color,
  outlineColor: TEXT_PRESETS[0].outlineColor,
  outlineWidth: TEXT_PRESETS[0].outlineWidth,
  shadow: TEXT_PRESETS[0].shadow,
  position: "bottom-center",
  scale: 1,
};

function applyPreset(preset: TextPreset, block: TextBlockConfig): TextBlockConfig {
  return {
    ...block,
    fontFamily: preset.fontFamily,
    color: preset.color,
    outlineColor: preset.outlineColor,
    outlineWidth: preset.outlineWidth,
    shadow: preset.shadow,
  };
}

/** Inject a Google Fonts <link> into <head> if not already present. */
function loadGoogleFont(family: string): void {
  const id = `gfont-${family.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

function PreviewText({ block, type }: { block: TextBlockConfig; type: "header" | "footer" }) {
  if (!block.text) return null;

  const isHeader = type === "header";
  const baseSizeClass = isHeader ? "text-[8cqw]" : "text-[5cqw]";

  const positionStyles: Record<string, string> = {
    top: "top-[5%] left-1/2 -translate-x-1/2",
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "bottom-left": "bottom-[3%] left-[5%]",
    "bottom-center": "bottom-[3%] left-1/2 -translate-x-1/2",
    "bottom-right": "bottom-[3%] right-[5%]",
  };

  const shadow = block.shadow ? "2px 3px 4px rgba(0,0,0,0.5)" : "none";
  const textStroke =
    block.outlineWidth > 0 && block.outlineColor !== "transparent"
      ? `${block.outlineWidth}px ${block.outlineColor}`
      : undefined;

  return (
    <div
      className={cn("absolute font-bold text-center", baseSizeClass, positionStyles[block.position])}
      style={{
        fontFamily: `"${block.fontFamily}", sans-serif`,
        color: block.color,
        textShadow: shadow,
        WebkitTextStroke: textStroke,
        maxWidth: "95%",
wordWrap: "break-word",
        overflowWrap: "break-word",
        lineHeight: 1.2,
      }}
    >
      {block.text}
    </div>
  );
}

export function TextOverlayModal({
  open,
  onOpenChange,
  imageUrl,
  defaultTitle = "",
  onApply,
}: TextOverlayModalProps) {
  const [header, setHeader] = useState<TextBlockConfig>({ ...DEFAULT_HEADER, text: defaultTitle });
  const [footer, setFooter] = useState<TextBlockConfig>({ ...DEFAULT_FOOTER });
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFontList, setShowFontList] = useState(false);
  const [applying, setApplying] = useState(false);
  const [blending, setBlending] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setHeader({ ...DEFAULT_HEADER, text: defaultTitle });
      setFooter({ ...DEFAULT_FOOTER });
      setPresetId(DEFAULT_PRESET_ID);
      setShowAdvanced(false);
      setApplying(false);
      setBlending(false);
    }
  }, [open, defaultTitle]);

  // Load font when it changes
  useEffect(() => {
    if (header.fontFamily) loadGoogleFont(header.fontFamily);
    if (footer.fontFamily) loadGoogleFont(footer.fontFamily);
  }, [header.fontFamily, footer.fontFamily]);

  // Load all preset fonts on mount
  useEffect(() => {
    TEXT_PRESETS.forEach((p) => loadGoogleFont(p.fontFamily));
  }, []);

  const selectPreset = useCallback((preset: TextPreset) => {
    setPresetId(preset.id);
    setHeader((h) => applyPreset(preset, h));
    setFooter((f) => applyPreset(preset, f));
  }, []);

  const selectFont = useCallback((fontFamily: string) => {
    loadGoogleFont(fontFamily);
    setHeader((h) => ({ ...h, fontFamily }));
    setFooter((f) => ({ ...f, fontFamily }));
    setShowFontList(false);
  }, []);

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/generate/text-overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          header: header.text ? header : null,
          footer: footer.text ? footer : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onApply(data.base64, data.previewUrl);
        onOpenChange(false);
      } else {
        notify.error(data.error || "Failed to apply text overlay");
      }
    } catch {
      notify.error("Failed to apply text overlay");
    } finally {
      setApplying(false);
    }
  };

  const handleBlend = async () => {
    setBlending(true);
    try {
      // First apply canvas overlay
      const overlayRes = await fetch("/api/generate/text-overlay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          header: header.text ? header : null,
          footer: footer.text ? footer : null,
        }),
      });
      const overlayData = await overlayRes.json();
      if (!overlayData.success) {
        notify.error(overlayData.error || "Failed to generate overlay");
        return;
      }

      // Then blend with AI
      const blendRes = await fetch("/api/generate/text-overlay-blend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: overlayData.base64 }),
      });
      const blendData = await blendRes.json();
      if (blendData.success) {
        onApply(blendData.base64, blendData.previewUrl);
        onOpenChange(false);
      } else {
        notify.error(blendData.error || "Failed to blend text");
      }
    } catch {
      notify.error("Failed to blend text");
    } finally {
      setBlending(false);
    }
  };

  const hasText = Boolean(header.text || footer.text);
  const busy = applying || blending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">Text Overlay Editor</h3>

        {/* Preview */}
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border" style={{ containerType: "inline-size" }}>
          <img src={imageUrl} alt="Source" className="block w-full" />
          <PreviewText block={header} type="header" />
          <PreviewText block={footer} type="footer" />
        </div>

        {/* Text Inputs */}
        <div className="grid gap-3">
          <div>
            <Label className="text-sm font-medium">Header Text</Label>
            <Input
              value={header.text}
              onChange={(e) => setHeader((h) => ({ ...h, text: e.target.value }))}
              placeholder="e.g. COZY & CUTE"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Footer Text</Label>
            <Input
              value={footer.text}
              onChange={(e) => setFooter((f) => ({ ...f, text: e.target.value }))}
              placeholder="e.g. Coloring Book"
            />
          </div>
        </div>

        {/* Font Selector */}
        <div>
          <Label className="text-sm font-medium">Font</Label>
          <button
            type="button"
            onClick={() => setShowFontList(!showFontList)}
            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
            style={{ fontFamily: `"${header.fontFamily}", sans-serif` }}
          >
            <span>{header.fontFamily}</span>
            <FontAwesomeIcon icon={faFont} className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {showFontList && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-background shadow-md">
              {FONT_CATALOG.map((group) => (
                <div key={group.category}>
                  <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    {group.category}
                  </div>
                  {group.fonts.map((font) => {
                    loadGoogleFont(font);
                    return (
                      <button
                        key={font}
                        type="button"
                        onClick={() => selectFont(font)}
                        className={cn(
                          "block w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors",
                          font === header.fontFamily && "bg-accent font-semibold",
                        )}
                        style={{ fontFamily: `"${font}", sans-serif` }}
                      >
                        {font}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Presets */}
        <div>
          <Label className="text-sm font-medium">Style Preset</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  presetId === preset.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted hover:border-primary/40",
                )}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <FontAwesomeIcon icon={showAdvanced ? faChevronUp : faChevronDown} className="h-3 w-3" />
          Advanced
        </button>

        {showAdvanced && (
          <div className="grid gap-3 rounded-lg border p-3 bg-muted/30">
            {/* Colors */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Text Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={header.color}
                    onChange={(e) => {
                      setHeader((h) => ({ ...h, color: e.target.value }));
                      setFooter((f) => ({ ...f, color: e.target.value }));
                    }}
                    className="h-8 w-8 cursor-pointer rounded border"
                  />
                  <span className="text-xs text-muted-foreground">{header.color}</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Outline Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={header.outlineColor === "transparent" ? "#000000" : header.outlineColor}
                    onChange={(e) => {
                      setHeader((h) => ({ ...h, outlineColor: e.target.value }));
                      setFooter((f) => ({ ...f, outlineColor: e.target.value }));
                    }}
                    className="h-8 w-8 cursor-pointer rounded border"
                  />
                  <span className="text-xs text-muted-foreground">{header.outlineColor}</span>
                </div>
              </div>
            </div>

            {/* Outline Width */}
            <div>
              <Label className="text-xs">Outline Width: {header.outlineWidth}px</Label>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={header.outlineWidth}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setHeader((h) => ({ ...h, outlineWidth: v }));
                  setFooter((f) => ({ ...f, outlineWidth: v }));
                }}
                className="w-full"
              />
            </div>

            {/* Shadow */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="shadow-toggle"
                checked={header.shadow}
                onChange={(e) => {
                  setHeader((h) => ({ ...h, shadow: e.target.checked }));
                  setFooter((f) => ({ ...f, shadow: e.target.checked }));
                }}
                className="rounded"
              />
              <Label htmlFor="shadow-toggle" className="text-xs cursor-pointer">
                Drop Shadow
              </Label>
            </div>

            {/* Header Position */}
            <div>
              <Label className="text-xs">Header Position</Label>
              <div className="flex gap-2 mt-1">
                {(["top", "center"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setHeader((h) => ({ ...h, position: pos }))}
                    className={cn(
                      "rounded border px-2 py-1 text-xs capitalize transition-colors",
                      header.position === pos ? "border-primary bg-primary/10" : "border-muted",
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Position */}
            <div>
              <Label className="text-xs">Footer Position</Label>
              <div className="flex gap-2 mt-1">
                {(["bottom-left", "bottom-center", "bottom-right"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setFooter((f) => ({ ...f, position: pos }))}
                    className={cn(
                      "rounded border px-2 py-1 text-xs transition-colors",
                      footer.position === pos ? "border-primary bg-primary/10" : "border-muted",
                    )}
                  >
                    {pos.replace("bottom-", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Scale */}
            <div>
              <Label className="text-xs">Font Scale: {Math.round(header.scale * 100)}%</Label>
              <input
                type="range"
                min={50}
                max={150}
                step={5}
                value={header.scale * 100}
                onChange={(e) => {
                  const s = Number(e.target.value) / 100;
                  setHeader((h) => ({ ...h, scale: s }));
                  setFooter((f) => ({ ...f, scale: s }));
                }}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!hasText || busy}>
            {applying ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
            ) : null}
            {applying ? "Applying..." : "Apply"}
          </Button>
          <Button variant="outline" onClick={handleBlend} disabled={!hasText || busy}>
            {blending ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <FontAwesomeIcon icon={faSparkles} className="mr-1.5 h-3.5 w-3.5" />
            )}
            {blending ? "Blending..." : "AI Blend"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
