"use client";

import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck } from "@fortawesome/pro-regular-svg-icons";
import { ArtStylePicker } from "@/components/art-style-picker";
import type { CloneJob, ExtractedCharacter, ExtractedLocation } from "@/lib/ai/clone-types";

interface CloneConfirmStepProps {
  job: CloneJob;
  onBack: () => void;
}

type UniqueCharacter = ExtractedCharacter & { fromPages: number[] };
type UniqueLocation = ExtractedLocation & { fromPages: number[] };

export function CloneConfirmStep({ job, onBack }: CloneConfirmStepProps) {
  const [title, setTitle] = useState(job.bookData?.title || job.name);
  const [subtitle, setSubtitle] = useState(job.bookData?.subtitle || "");
  const [description, setDescription] = useState(job.bookData?.description || "");
  const [artStyleId, setArtStyleId] = useState<string | null>(job.bookData?.artStyleId || null);
  const [selectedCharPages, setSelectedCharPages] = useState<Set<number>>(new Set());
  const [selectedLocPages, setSelectedLocPages] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(job.status === "confirmed");
  const [savedCounts, setSavedCounts] = useState({ characters: 0, locations: 0 });

  // Deduplicate characters across pages
  const uniqueCharacters = useMemo<UniqueCharacter[]>(() => {
    const map = new Map<string, UniqueCharacter>();
    for (const page of job.pages) {
      if (!page.rawData?.characters) continue;
      for (const char of page.rawData.characters) {
        const key = char.name.toLowerCase();
        if (map.has(key)) {
          map.get(key)!.fromPages.push(page.pageNumber);
        } else {
          map.set(key, { ...char, fromPages: [page.pageNumber] });
        }
      }
    }
    return Array.from(map.values());
  }, [job.pages]);

  // Deduplicate locations across pages
  const uniqueLocations = useMemo<UniqueLocation[]>(() => {
    const map = new Map<string, UniqueLocation>();
    for (const page of job.pages) {
      if (!page.rawData?.locations) continue;
      for (const loc of page.rawData.locations) {
        const key = loc.name.toLowerCase();
        if (map.has(key)) {
          map.get(key)!.fromPages.push(page.pageNumber);
        } else {
          map.set(key, { ...loc, fromPages: [page.pageNumber] });
        }
      }
    }
    return Array.from(map.values());
  }, [job.pages]);

  const toggleCharPage = (pageNum: number) => {
    setSelectedCharPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const toggleLocPage = (pageNum: number) => {
    setSelectedLocPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/clone/${job.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookData: { title, subtitle, description, artStyleId },
          saveCharacters: Array.from(selectedCharPages),
          saveLocations: Array.from(selectedLocPages),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedCounts({
          characters: data.savedCharacters?.length || 0,
          locations: data.savedLocations?.length || 0,
        });
        setConfirmed(true);
      }
    } catch (err) {
      console.error("Confirm failed:", err);
    } finally {
      setConfirming(false);
    }
  };

  if (confirmed) {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <FontAwesomeIcon icon={faCheck} className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold">Clone Job Confirmed</h3>
        <div className="text-center text-sm text-muted-foreground">
          {savedCounts.characters > 0 && (
            <p>{savedCounts.characters} character(s) saved to library</p>
          )}
          {savedCounts.locations > 0 && <p>{savedCounts.locations} location(s) saved to library</p>}
          {savedCounts.characters === 0 && savedCounts.locations === 0 && (
            <p>Clone job confirmed. No entities were selected to save.</p>
          )}
        </div>
        <div className="flex gap-3">
          {savedCounts.characters > 0 && (
            <a
              href="/characters"
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              View Characters
            </a>
          )}
          {savedCounts.locations > 0 && (
            <a
              href="/locations"
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              View Locations
            </a>
          )}
          <a
            href="/clone"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Clone Another
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Book metadata */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Book Information</h3>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Subtitle</label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Art Style</label>
          <ArtStylePicker value={artStyleId} onChange={(id) => setArtStyleId(id)} />
        </div>
      </div>

      {/* Characters to save */}
      {uniqueCharacters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Characters ({uniqueCharacters.length} found)</h3>
          <p className="text-xs text-muted-foreground">
            Select which page&apos;s characters to save to library
          </p>
          <div className="space-y-2">
            {uniqueCharacters.map((char) => (
              <label key={char.name} className="flex items-start gap-3 rounded-md border p-3">
                <input
                  type="checkbox"
                  checked={char.fromPages.some((p) => selectedCharPages.has(p))}
                  onChange={() => toggleCharPage(char.fromPages[0])}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">
                    {char.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({char.type}, {char.role})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Found on pages: {char.fromPages.join(", ")}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Locations to save */}
      {uniqueLocations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Locations ({uniqueLocations.length} found)</h3>
          <p className="text-xs text-muted-foreground">
            Select which page&apos;s locations to save to library
          </p>
          <div className="space-y-2">
            {uniqueLocations.map((loc) => (
              <label key={loc.name} className="flex items-start gap-3 rounded-md border p-3">
                <input
                  type="checkbox"
                  checked={loc.fromPages.some((p) => selectedLocPages.has(p))}
                  onChange={() => toggleLocPage(loc.fromPages[0])}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">{loc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {loc.description} — Pages: {loc.fromPages.join(", ")}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {confirming && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />}
          Confirm & Save
        </button>
      </div>
    </div>
  );
}
