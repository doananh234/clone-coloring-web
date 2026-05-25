"use client";

import { useState } from "react";
import { Dialog, DialogContent, Button, Input, Badge, Textarea } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faSparkles,
  faCheck,
  faChevronDown,
  faChevronUp,
  faXmark,
  faUser,
  faMapPin,
} from "@fortawesome/pro-regular-svg-icons";

type ExtractedCharacter = {
  name: string;
  type: string;
  role: string;
  visualDna: Record<string, unknown>;
  characterPrompt: string;
  tags: string[];
  selected: boolean;
  saving: boolean;
  saved: boolean;
};

type ExtractedLocation = {
  name: string;
  description: string;
  visualDescription: string;
  locationPrompt: string;
  atmosphere: Record<string, string>;
  props: string[];
  tags: string[];
  selected: boolean;
  saving: boolean;
  saved: boolean;
};

type ExtractionReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  sourceBookId: string;
  sourcePageId: string;
};

export function ExtractionReviewModal({
  open,
  onOpenChange,
  imageUrl,
  sourceBookId,
  sourcePageId,
}: ExtractionReviewModalProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [characters, setCharacters] = useState<ExtractedCharacter[]>([]);
  const [locations, setLocations] = useState<ExtractedLocation[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/extract/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setCharacters(
          (data.characters || []).map((c: Record<string, unknown>) => ({
            ...c,
            selected: true,
            saving: false,
            saved: false,
          })),
        );
        setLocations(
          (data.locations || []).map((l: Record<string, unknown>) => ({
            ...l,
            selected: true,
            saving: false,
            saved: false,
          })),
        );
        setAnalyzed(true);
      } else {
        notify.error(data.error || "Analysis failed");
      }
    } catch {
      notify.error("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSaveSelected() {
    setSavingAll(true);
    let savedCount = 0;

    // Save characters
    for (let i = 0; i < characters.length; i++) {
      if (!characters[i].selected || characters[i].saved) continue;
      setCharacters((prev) => prev.map((c, j) => (j === i ? { ...c, saving: true } : c)));
      try {
        const res = await fetch("/api/extract/save-character", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...characters[i],
            sourceBookId,
            sourcePageId,
            sourceImageUrl: imageUrl,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setCharacters((prev) =>
            prev.map((c, j) => (j === i ? { ...c, saving: false, saved: true } : c)),
          );
          savedCount++;
        } else {
          notify.error(
            `Failed to save character "${characters[i].name}": ${data.error || "Unknown error"}`,
          );
          setCharacters((prev) => prev.map((c, j) => (j === i ? { ...c, saving: false } : c)));
        }
      } catch {
        notify.error(`Failed to save character "${characters[i].name}"`);
        setCharacters((prev) => prev.map((c, j) => (j === i ? { ...c, saving: false } : c)));
      }
    }

    // Save locations
    for (let i = 0; i < locations.length; i++) {
      if (!locations[i].selected || locations[i].saved) continue;
      setLocations((prev) => prev.map((l, j) => (j === i ? { ...l, saving: true } : l)));
      try {
        const res = await fetch("/api/extract/save-location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...locations[i],
            sourceBookId,
            sourcePageId,
            sourceImageUrl: imageUrl,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setLocations((prev) =>
            prev.map((l, j) => (j === i ? { ...l, saving: false, saved: true } : l)),
          );
          savedCount++;
        } else {
          notify.error(
            `Failed to save location "${locations[i].name}": ${data.error || "Unknown error"}`,
          );
          setLocations((prev) => prev.map((l, j) => (j === i ? { ...l, saving: false } : l)));
        }
      } catch {
        notify.error(`Failed to save location "${locations[i].name}"`);
        setLocations((prev) => prev.map((l, j) => (j === i ? { ...l, saving: false } : l)));
      }
    }

    setSavingAll(false);
    notify.success(`Saved ${savedCount} items to library`);
  }

  function updateCharacter(index: number, field: string, value: unknown) {
    setCharacters((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function updateLocation(index: number, field: string, value: unknown) {
    setLocations((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-5xl !h-[85vh] !p-0 !gap-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Extract Characters & Locations</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Source image */}
          <div className="w-[300px] shrink-0 border-r bg-muted/30 p-4 flex flex-col items-center justify-center">
            <img
              src={imageUrl}
              alt="Source"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>

          {/* Right: Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {!analyzed && !analyzing && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <FontAwesomeIcon icon={faSparkles} className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Click analyze to extract characters and locations from this page
                </p>
                <Button onClick={handleAnalyze}>
                  <FontAwesomeIcon icon={faSparkles} className="mr-2 h-4 w-4" />
                  Analyze with AI
                </Button>
              </div>
            )}

            {analyzing && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-primary" />
                <p className="text-sm text-muted-foreground">Analyzing image...</p>
              </div>
            )}

            {analyzed && (
              <div className="space-y-6">
                {/* Characters */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
                    <h3 className="font-semibold">Characters ({characters.length})</h3>
                  </div>
                  {characters.length === 0 && (
                    <p className="text-sm text-muted-foreground">No characters detected</p>
                  )}
                  <div className="space-y-2">
                    {characters.map((char, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 transition-colors ${
                          char.saved
                            ? "border-green-200 bg-green-50/50"
                            : char.selected
                              ? "border-primary/30 bg-primary/5"
                              : "opacity-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={char.selected}
                            onChange={(e) => updateCharacter(i, "selected", e.target.checked)}
                            className="mt-1"
                            disabled={char.saved}
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={char.name}
                                onChange={(e) => updateCharacter(i, "name", e.target.value)}
                                className="h-7 text-sm font-medium"
                                disabled={char.saved}
                              />
                              <Badge variant="secondary" className="text-[10px] shrink-0">
                                {char.type}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {char.role}
                              </Badge>
                              {char.saved && (
                                <Badge className="bg-green-500 text-[10px] shrink-0">
                                  <FontAwesomeIcon icon={faCheck} className="mr-1 h-3 w-3" />
                                  Saved
                                </Badge>
                              )}
                              {char.saving && (
                                <FontAwesomeIcon
                                  icon={faSpinner}
                                  spin
                                  className="h-3 w-3 shrink-0"
                                />
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {char.tags.map((tag, j) => (
                                <span
                                  key={j}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setExpandedPrompt(
                                  expandedPrompt === `char-${i}` ? null : `char-${i}`,
                                )
                              }
                            >
                              {expandedPrompt === `char-${i}` ? (
                                <FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" />
                              ) : (
                                <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
                              )}
                              Prompt
                            </button>
                            {expandedPrompt === `char-${i}` && (
                              <Textarea
                                value={char.characterPrompt}
                                onChange={(e) =>
                                  updateCharacter(i, "characterPrompt", e.target.value)
                                }
                                rows={3}
                                className="text-xs"
                                disabled={char.saved}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Locations */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faMapPin} className="h-4 w-4" />
                    <h3 className="font-semibold">Locations ({locations.length})</h3>
                  </div>
                  {locations.length === 0 && (
                    <p className="text-sm text-muted-foreground">No locations detected</p>
                  )}
                  <div className="space-y-2">
                    {locations.map((loc, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 transition-colors ${
                          loc.saved
                            ? "border-green-200 bg-green-50/50"
                            : loc.selected
                              ? "border-primary/30 bg-primary/5"
                              : "opacity-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={loc.selected}
                            onChange={(e) => updateLocation(i, "selected", e.target.checked)}
                            className="mt-1"
                            disabled={loc.saved}
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={loc.name}
                                onChange={(e) => updateLocation(i, "name", e.target.value)}
                                className="h-7 text-sm font-medium"
                                disabled={loc.saved}
                              />
                              {loc.atmosphere?.mood && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {loc.atmosphere.mood}
                                </Badge>
                              )}
                              {loc.saved && (
                                <Badge className="bg-green-500 text-[10px] shrink-0">
                                  <FontAwesomeIcon icon={faCheck} className="mr-1 h-3 w-3" />
                                  Saved
                                </Badge>
                              )}
                              {loc.saving && (
                                <FontAwesomeIcon
                                  icon={faSpinner}
                                  spin
                                  className="h-3 w-3 shrink-0"
                                />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{loc.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {loc.props.map((prop, j) => (
                                <span
                                  key={j}
                                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {prop}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setExpandedPrompt(expandedPrompt === `loc-${i}` ? null : `loc-${i}`)
                              }
                            >
                              {expandedPrompt === `loc-${i}` ? (
                                <FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" />
                              ) : (
                                <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
                              )}
                              Prompt
                            </button>
                            {expandedPrompt === `loc-${i}` && (
                              <Textarea
                                value={loc.locationPrompt}
                                onChange={(e) =>
                                  updateLocation(i, "locationPrompt", e.target.value)
                                }
                                rows={3}
                                className="text-xs"
                                disabled={loc.saved}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {analyzed && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {characters.filter((c) => c.selected && !c.saved).length +
                locations.filter((l) => l.selected && !l.saved).length}{" "}
              items selected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleSaveSelected} disabled={savingAll}>
                {savingAll ? (
                  <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-4 w-4" />
                ) : (
                  <FontAwesomeIcon icon={faCheck} className="mr-2 h-4 w-4" />
                )}
                {savingAll ? "Saving..." : "Save Selected to Library"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
