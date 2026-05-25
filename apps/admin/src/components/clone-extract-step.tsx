"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faCheck,
  faXmark,
  faUser,
  faMapPin,
} from "@fortawesome/pro-regular-svg-icons";
import { notify } from "@vx/core-uikit/notifications";
import type { CloneJob } from "@/lib/ai/clone-types";

interface CloneExtractStepProps {
  job: CloneJob;
  onJobUpdate: (job: CloneJob) => void;
  onNext: () => void;
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

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

export function CloneExtractStep({ job, onJobUpdate, onNext, onBack }: CloneExtractStepProps) {
  const [extracting, setExtracting] = useState(false);
  const [results, setResults] = useState<EntityResult[]>([]);
  const [done, setDone] = useState(
    job.status === "entities_ready" || job.status === "reproduced",
  );

  async function handleExtract() {
    setExtracting(true);
    setResults([]);
    try {
      const res = await fetch(`/api/clone/${job.id}/extract-entities`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setDone(true);
        notify.success(
          `Extracted ${data.succeeded} entities (${data.failed} failed)`,
        );
        // Update job state so parent knows
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

  const characters = results.filter((r) => r.type === "character");
  const locations = results.filter((r) => r.type === "location");

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Extract unique characters and locations from the analyzed pages, save them to your library,
        and generate reference images for each. These reference images will be used to reproduce the
        book pages with consistent characters and locations.
      </p>

      {!done && !extracting && (
        <button
          onClick={handleExtract}
          className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          Extract Characters & Locations and Generate Reference Images
        </button>
      )}

      {extracting && (
        <div className="flex flex-col items-center gap-3 py-8">
          <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Extracting entities and generating reference images...
          </p>
          <p className="text-xs text-muted-foreground">
            This may take a few minutes depending on the number of characters and locations.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          {/* Characters */}
          {characters.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5" />
                Characters ({characters.length})
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {characters.map((r) => (
                  <EntityCard key={r.id} entity={r} />
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {locations.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <FontAwesomeIcon icon={faMapPin} className="h-3.5 w-3.5" />
                Locations ({locations.length})
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {locations.map((r) => (
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
          Back
        </button>
        <div className="flex gap-2">
          {!done && (
            <button
              onClick={onNext}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Skip — Use Redesigned Pages →
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!done}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Next — Reproduce Book →
          </button>
        </div>
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
