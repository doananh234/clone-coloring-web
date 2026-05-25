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

type PageEntities = {
  pageNumber: number;
  imageUrl: string;
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
};

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CloneExtractStep({ job, onJobUpdate, onBack }: CloneExtractStepProps) {
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<EntityResult[]>([]);
  const [done, setDone] = useState(job.status === "entities_ready");
  const [progress, setProgress] = useState("");

  // Build per-page entity list from analyzed rawData
  const pageEntities = useMemo<PageEntities[]>(() => {
    return job.pages
      .filter((p) => p.rawData)
      .map((p) => ({
        pageNumber: p.pageNumber,
        imageUrl: p.imageUrl,
        characters: p.rawData?.characters || [],
        locations: p.rawData?.locations || [],
      }))
      .filter((p) => p.characters.length > 0 || p.locations.length > 0);
  }, [job.pages]);

  // Count unique entities
  const uniqueChars = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const pe of pageEntities) {
      for (const c of pe.characters) {
        const key = c.name.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); count++; }
      }
    }
    return count;
  }, [pageEntities]);

  const uniqueLocs = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const pe of pageEntities) {
      for (const l of pe.locations) {
        const key = l.name.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); count++; }
      }
    }
    return count;
  }, [pageEntities]);

  async function handleExtract() {
    setExtracting(true);
    setResults([]);
    setProgress(`Extracting ${uniqueChars} characters and ${uniqueLocs} locations...`);
    try {
      const res = await fetch(`/api/clone/${job.id}/extract-entities`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setDone(true);
        setProgress("");
        notify.success(
          `Done: ${data.succeeded} saved, ${data.failed} failed`,
        );
        onJobUpdate({ ...job, status: "entities_ready" } as CloneJob);
      } else {
        setProgress("");
        notify.error(data.error || "Extraction failed");
      }
    } catch {
      setProgress("");
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
        Save unique characters and locations to your library with AI-generated reference images.
        This is optional — your book has already been created.
      </p>

      {/* Summary before extraction */}
      <div className="flex gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5 text-blue-500" />
          <span className="font-medium">{uniqueChars}</span> characters
        </span>
        <span className="flex items-center gap-1.5">
          <FontAwesomeIcon icon={faMapPin} className="h-3.5 w-3.5 text-purple-500" />
          <span className="font-medium">{uniqueLocs}</span> locations
        </span>
        <span className="text-muted-foreground">across {pageEntities.length} pages</span>
      </div>

      {/* Per-page entity preview */}
      <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg border p-3">
        {pageEntities.map((pe) => (
          <div key={pe.pageNumber} className="flex gap-3">
            {/* Page thumbnail */}
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded border bg-muted">
              <img src={resolveUrl(pe.imageUrl)} alt="" className="h-full w-full object-cover" />
            </div>
            {/* Entities */}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">Page {pe.pageNumber}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {pe.characters.map((c) => (
                  <span key={c.name} className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <FontAwesomeIcon icon={faUser} className="h-2 w-2" />
                    {c.name}
                  </span>
                ))}
                {pe.locations.map((l) => (
                  <span key={l.name} className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    <FontAwesomeIcon icon={faMapPin} className="h-2 w-2" />
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Extract button or progress */}
      {!done && !extracting && (
        <button
          onClick={handleExtract}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          Extract All & Generate Reference Images
        </button>
      )}

      {extracting && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <FontAwesomeIcon icon={faSpinner} spin className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">{progress || "Processing..."}</p>
            <p className="text-xs text-muted-foreground">
              Generating reference images for each character and location. This may take a few minutes.
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
