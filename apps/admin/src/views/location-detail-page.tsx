"use client";

import { useState } from "react";
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
  faMapPin,
  faArrowUpRightFromSquare,
  faRotate,
  faPaintbrushPencil,
} from "@fortawesome/pro-regular-svg-icons";
import { DetailCard } from "@/components/detail-card";
import { appNavigate } from "@/lib/navigate";

// --- Types ---

interface LocationEntity {
  id: string;
  name: string;
  description: string;
  visualDescription: string;
  locationPrompt: string;
  atmosphere: {
    weather?: string;
    lighting?: string;
    timeOfDay?: string;
    mood?: string;
  };
  props: string[];
  tags: string[];
  referenceImageUrl?: string;
  sourceImageUrl?: string;
  sourceBookId?: string;
  sourcePageId?: string;
}

// --- Helpers ---

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";

function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => notify.success("Copied to clipboard"),
    () => notify.error("Failed to copy"),
  );
}

// --- Component ---

export function LocationDetailPage({ locationId }: { locationId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [redesignPrompt, setRedesignPrompt] = useState("");
  const [showRedesign, setShowRedesign] = useState(false);

  async function handleRegenerate(customPrompt?: string) {
    if (!location?.locationPrompt) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regenerateReference: true,
          ...(customPrompt ? { redesignPrompt: customPrompt } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success(customPrompt ? "Redesign complete" : "Reference image regenerated");
        queryClient.invalidateQueries({ queryKey: ["locations", locationId] });
        setRedesignPrompt("");
        setShowRedesign(false);
      } else {
        notify.error(data.error || "Failed to regenerate");
      }
    } catch {
      notify.error("Failed to regenerate reference image");
    } finally {
      setRegenerating(false);
    }
  }

  const { data: location, isLoading } = useQuery<LocationEntity>({
    queryKey: ["locations", locationId],
    queryFn: () => fetch(`/api/locations/${locationId}`).then((r) => r.json()),
    enabled: !!locationId,
  });

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/locations/${locationId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Location deleted");
        queryClient.invalidateQueries({ queryKey: ["locations"] });
        appNavigate("/locations");
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete location");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading || !location) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const atmosphere = location.atmosphere || {};
  const atmosphereEntries = Object.entries(atmosphere).filter(([, v]) => v && String(v).length > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{location.name}</h1>
          {atmosphere.mood && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {atmosphere.mood}
            </span>
          )}
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <FontAwesomeIcon icon={faTrash} className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {/* Split Panel */}
      <div className="flex gap-6">
        {/* LEFT PANEL -- Sticky Media */}
        <div className="w-[280px] shrink-0 space-y-4 self-start sticky top-4">
          {/* Reference image */}
          <div className="overflow-hidden rounded-lg border">
            {location.referenceImageUrl ? (
              <img
                src={resolveUrl(location.referenceImageUrl)}
                alt={location.name}
                className="w-full object-cover"
                style={{ maxHeight: 280 }}
              />
            ) : (
              <div className="flex h-[220px] items-center justify-center bg-muted text-muted-foreground">
                <FontAwesomeIcon icon={faMapPin} className="h-12 w-12 opacity-30" />
              </div>
            )}
          </div>

          {/* Source image */}
          {location.sourceImageUrl && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
                Source Image
              </p>
              <div className="overflow-hidden rounded-lg border">
                <img
                  src={resolveUrl(location.sourceImageUrl)}
                  alt="Source"
                  className="w-full object-cover"
                  style={{ maxHeight: 180 }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={regenerating}
              onClick={() => handleRegenerate()}
            >
              <FontAwesomeIcon
                icon={faRotate}
                spin={regenerating && !showRedesign}
                className="mr-1.5 h-3.5 w-3.5"
              />
              Regenerate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={regenerating}
              onClick={() => setShowRedesign((v) => !v)}
            >
              <FontAwesomeIcon icon={faPaintbrushPencil} className="mr-1.5 h-3.5 w-3.5" />
              Redesign
            </Button>
          </div>

          {/* Redesign prompt input */}
          {showRedesign && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Describe what to change (e.g. &quot;add more trees&quot;, &quot;make it a night
                scene&quot;)
              </p>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder="Enter redesign instructions..."
                value={redesignPrompt}
                onChange={(e) => setRedesignPrompt(e.target.value)}
                disabled={regenerating}
              />
              <Button
                size="sm"
                className="w-full"
                disabled={regenerating || !redesignPrompt.trim()}
                onClick={() => handleRegenerate(redesignPrompt.trim())}
              >
                <FontAwesomeIcon
                  icon={faPaintbrushPencil}
                  spin={regenerating}
                  className="mr-1.5 h-3.5 w-3.5"
                />
                {regenerating ? "Redesigning..." : "Apply Redesign"}
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL -- Scrollable Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Description */}
          {location.description && (
            <DetailCard title="Description">
              <p className="text-sm leading-relaxed">{location.description}</p>
            </DetailCard>
          )}

          {/* Visual Description */}
          {location.visualDescription && (
            <DetailCard title="Visual Description">
              <p className="text-sm leading-relaxed">{location.visualDescription}</p>
            </DetailCard>
          )}

          {/* Atmosphere */}
          {atmosphereEntries.length > 0 && (
            <DetailCard title="Atmosphere">
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                {atmosphereEntries.map(([key, val]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground capitalize">{key}</dt>
                    <dd>{String(val)}</dd>
                  </div>
                ))}
              </dl>
            </DetailCard>
          )}

          {/* Props */}
          {location.props?.length > 0 && (
            <DetailCard title="Props">
              <div className="flex flex-wrap gap-1.5">
                {location.props.map((prop) => (
                  <Badge key={prop} variant="secondary">
                    {prop}
                  </Badge>
                ))}
              </div>
            </DetailCard>
          )}

          {/* Location Prompt */}
          <DetailCard
            title="Location Prompt"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(location.locationPrompt)}
              >
                <FontAwesomeIcon icon={faCopy} className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
            }
          >
            <div className="rounded-md bg-muted p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {location.locationPrompt}
              </p>
            </div>
          </DetailCard>

          {/* Tags */}
          {location.tags?.length > 0 && (
            <DetailCard title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {location.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </DetailCard>
          )}

          {/* Source */}
          {location.sourceBookId && (
            <DetailCard title="Source">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Book:</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => appNavigate(`/books/${location.sourceBookId}`)}
                >
                  {location.sourceBookId}
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </DetailCard>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Location"
        description={`Delete "${location.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
