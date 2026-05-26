"use client";

import { useState, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCheck,
  faXmark,
  faUser,
  faMapPin,
} from "@fortawesome/pro-regular-svg-icons";
import { cn } from "@vx/core-uikit/utils";
import { notify } from "@vx/core-uikit/notifications";
import type { CloneJob, ExtractedCharacter, ExtractedLocation } from "@/lib/ai/clone-types";

interface CloneExtractStepProps {
  job: CloneJob;
  onJobUpdate: (job: CloneJob) => void;
  onBack: () => void;
}

type EntityResult = {
  id: string;
  name: string;
  type: "character" | "location";
  referenceImageUrl: string;
  status: "success" | "error";
  error?: string;
};

// A character entry with page source info
type CharEntry = ExtractedCharacter & { pageNumber: number; imageUrl: string };
type LocEntry = ExtractedLocation & { pageNumber: number; imageUrl: string };

// A group of similar characters
type CharGroup = { key: string; entries: CharEntry[] };

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

/** Check if two names are similar (substring or word overlap) */
function namesAreSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter((w) => w.length > 2);
  const wb = nb.split(/\s+/).filter((w) => w.length > 2);
  const shorter = wa.length <= wb.length ? wa : wb;
  const longer = wa.length > wb.length ? wa : wb;
  if (shorter.length > 0 && shorter.every((w) => longer.includes(w))) return true;
  return false;
}

/** Group characters by name similarity */
function groupCharacters(entries: CharEntry[]): CharGroup[] {
  const groups: CharGroup[] = [];
  for (const entry of entries) {
    const match = groups.find((g) => namesAreSimilar(g.key, entry.name));
    if (match) {
      match.entries.push(entry);
    } else {
      groups.push({ key: entry.name.toLowerCase().trim(), entries: [entry] });
    }
  }
  return groups;
}

export function CloneExtractStep({ job, onJobUpdate, onBack }: CloneExtractStepProps) {
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<EntityResult[]>([]);
  const [done, setDone] = useState(job.status === "entities_ready");

  // Collect all characters with page info
  const allChars = useMemo<CharEntry[]>(() => {
    const items: CharEntry[] = [];
    for (const page of job.pages) {
      if (!page.rawData?.characters) continue;
      for (const c of page.rawData.characters) {
        items.push({ ...c, pageNumber: page.pageNumber, imageUrl: page.imageUrl });
      }
    }
    return items;
  }, [job.pages]);

  // Collect all locations with page info
  const allLocs = useMemo<LocEntry[]>(() => {
    const items: LocEntry[] = [];
    for (const page of job.pages) {
      if (!page.rawData?.locations) continue;
      for (const l of page.rawData.locations) {
        items.push({ ...l, pageNumber: page.pageNumber, imageUrl: page.imageUrl });
      }
    }
    return items;
  }, [job.pages]);

  // Group similar characters
  const charGroups = useMemo(() => groupCharacters(allChars), [allChars]);

  // Dedup locations by exact name
  const locGroups = useMemo(() => {
    const map = new Map<string, LocEntry[]>();
    for (const loc of allLocs) {
      const key = loc.name.toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(loc);
    }
    return Array.from(map.entries()).map(([key, entries]) => ({ key, entries }));
  }, [allLocs]);

  // Selection state: key = "char:{groupIdx}:{entryIdx}" or "loc:{groupIdx}"
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Default: select first entry of each character group + all locations
    const s = new Set<string>();
    charGroups.forEach((g, gi) => s.add(`char:${gi}:0`));
    locGroups.forEach((_, li) => s.add(`loc:${li}`));
    return s;
  });

  function toggleChar(groupIdx: number, entryIdx: number) {
    const key = `char:${groupIdx}:${entryIdx}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleLoc(groupIdx: number) {
    const key = `loc:${groupIdx}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Build the selected entities list for the API
  function getSelectedEntities() {
    const characters: { char: ExtractedCharacter; sourcePageImageUrl: string }[] = [];
    const locations: { loc: ExtractedLocation; sourcePageImageUrl: string }[] = [];

    charGroups.forEach((g, gi) => {
      g.entries.forEach((entry, ei) => {
        if (selected.has(`char:${gi}:${ei}`)) {
          characters.push({ char: entry, sourcePageImageUrl: entry.imageUrl });
        }
      });
    });

    locGroups.forEach((g, li) => {
      if (selected.has(`loc:${li}`)) {
        const best = g.entries.reduce((a, b) =>
          (b.locationPrompt?.length || 0) > (a.locationPrompt?.length || 0) ? b : a,
        );
        locations.push({ loc: best, sourcePageImageUrl: best.imageUrl });
      }
    });

    return { characters, locations };
  }

  const selectedCount = Array.from(selected).length;

  async function handleExtract() {
    setExtracting(true);
    setResults([]);
    try {
      const { characters, locations } = getSelectedEntities();
      const res = await fetch(`/api/clone/${job.id}/extract-entities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characters, locations }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setDone(true);
        notify.success(`Done: ${data.succeeded} saved, ${data.failed} failed`);
        onJobUpdate({ ...job, status: "entities_ready" } as CloneJob);
      } else {
        notify.error(data.error || "Extraction failed");
      }
    } catch {
      notify.error("Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  const resultChars = results.filter((r) => r.type === "character");
  const resultLocs = results.filter((r) => r.type === "location");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Select which characters and locations to save to your library. Similar names are grouped — you can pick multiple variants if they look different.
      </p>

      {/* Characters */}
      {charGroups.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5 text-blue-500" />
            Characters ({charGroups.length} groups, {allChars.length} total)
          </h4>
          <div className="max-h-[250px] space-y-2 overflow-y-auto rounded-lg border p-2">
            {charGroups.map((group, gi) => (
              <div key={gi} className="rounded-md border bg-muted/30 p-2">
                {group.entries.length > 1 && (
                  <p className="mb-1.5 text-[10px] font-medium text-amber-600">
                    Similar: {group.entries.map((e) => e.name).join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {group.entries.map((entry, ei) => {
                    const isSelected = selected.has(`char:${gi}:${ei}`);
                    return (
                      <button
                        key={ei}
                        type="button"
                        onClick={() => toggleChar(gi, ei)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-all",
                          isSelected
                            ? "border-blue-400 bg-blue-50 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-950 dark:text-blue-300"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {/* Page thumbnail */}
                        <div className="h-6 w-5 shrink-0 overflow-hidden rounded bg-muted">
                          <img src={resolveUrl(entry.imageUrl)} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="text-left">
                          <span className="font-medium">{entry.name}</span>
                          <span className="ml-1 text-[9px] opacity-60">p.{entry.pageNumber}</span>
                          {entry.type && (
                            <span className="ml-1 text-[9px] opacity-60">({entry.type})</span>
                          )}
                        </div>
                        {isSelected && <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5 text-blue-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locations */}
      {locGroups.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <FontAwesomeIcon icon={faMapPin} className="h-3.5 w-3.5 text-purple-500" />
            Locations ({locGroups.length})
          </h4>
          <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-lg border p-2">
            {locGroups.map((group, li) => {
              const isSelected = selected.has(`loc:${li}`);
              const entry = group.entries[0];
              return (
                <button
                  key={li}
                  type="button"
                  onClick={() => toggleLoc(li)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-all",
                    isSelected
                      ? "border-purple-400 bg-purple-50 text-purple-700 ring-1 ring-purple-300 dark:bg-purple-950 dark:text-purple-300"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <div className="h-6 w-5 shrink-0 overflow-hidden rounded bg-muted">
                    <img src={resolveUrl(entry.imageUrl)} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{entry.name}</span>
                    <span className="ml-1 text-[9px] opacity-60">
                      ({group.entries.length} page{group.entries.length > 1 ? "s" : ""})
                    </span>
                  </div>
                  {isSelected && <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5 text-purple-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extract button */}
      {!done && !extracting && (
        <button
          onClick={handleExtract}
          disabled={selectedCount === 0}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Extract {selectedCount} Selected & Generate Reference Images
        </button>
      )}

      {extracting && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <FontAwesomeIcon icon={faSpinner} spin className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Generating reference images...</p>
            <p className="text-xs text-muted-foreground">
              Processing {selectedCount} entities. This may take a few minutes.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {resultChars.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold">
                <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
                Characters ({resultChars.length})
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {resultChars.map((r) => (
                  <EntityCard key={r.id} entity={r} />
                ))}
              </div>
            </div>
          )}
          {resultLocs.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold">
                <FontAwesomeIcon icon={faMapPin} className="h-3 w-3" />
                Locations ({resultLocs.length})
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {resultLocs.map((r) => (
                  <EntityCard key={r.id} entity={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          ← Back to Book
        </button>
        {done && (
          <div className="flex gap-2">
            <a
              href="/characters"
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              View Characters
            </a>
            <a
              href="/locations"
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              View Locations
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: EntityResult }) {
  const isSuccess = entity.status === "success";

  return (
    <div className="flex items-center gap-2 rounded-lg border p-2">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
        {isSuccess && entity.referenceImageUrl ? (
          <img
            src={resolveUrl(entity.referenceImageUrl)}
            alt={entity.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FontAwesomeIcon
              icon={isSuccess ? faCheck : faXmark}
              className={`h-4 w-4 ${isSuccess ? "text-green-500" : "text-red-500"}`}
            />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{entity.name}</p>
        <p className={`text-[10px] ${isSuccess ? "text-green-600" : "text-red-500"}`}>
          {isSuccess ? "Reference generated" : entity.error || "Failed"}
        </p>
      </div>
    </div>
  );
}
