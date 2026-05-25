"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Input, Card, CardContent } from "@vx/core-uikit/components";
import { ConfirmDialog } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faEye,
  faTrash,
  faMapPin,
  faUpload,
  faRotate,
  faImageSlash,
} from "@fortawesome/pro-regular-svg-icons";
import { appNavigate } from "@/lib/navigate";
import { ExtractionReviewModal } from "@/components/extraction-review-modal";

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

// --- Filter types ---

type FilterKey = "all" | "nature" | "indoor" | "urban" | "fantasy" | "missing_image";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missing_image", label: "Missing Image" },
  { key: "nature", label: "Nature" },
  { key: "indoor", label: "Indoor" },
  { key: "urban", label: "Urban" },
  { key: "fantasy", label: "Fantasy" },
];

function applyFilter(items: LocationEntity[], filter: FilterKey): LocationEntity[] {
  if (filter === "all") return items;
  if (filter === "missing_image") return items.filter((loc) => !loc.referenceImageUrl);
  return items.filter((loc) => loc.tags?.some((t) => t.toLowerCase().includes(filter)));
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

const MOOD_COLORS: Record<string, string> = {
  peaceful: "bg-green-100 text-green-700",
  mysterious: "bg-purple-100 text-purple-700",
  cheerful: "bg-yellow-100 text-yellow-700",
  dramatic: "bg-red-100 text-red-700",
  serene: "bg-blue-100 text-blue-700",
};

// --- Component ---

export function LocationListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [deleteTarget, setDeleteTarget] = useState<LocationEntity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [extractionImageUrl, setExtractionImageUrl] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);

  function handleUploadForExtraction(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setExtractionImageUrl(reader.result as string);
      setExtractionOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const { data: result, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: () => fetch("/api/locations").then((r) => r.json()),
  });

  const allLocations: LocationEntity[] = result?.data ?? [];

  const filtered = useMemo(() => {
    let items = applyFilter(allLocations, filter);
    if (search) {
      const lower = search.toLowerCase();
      items = items.filter(
        (loc) =>
          loc.name?.toLowerCase().includes(lower) ||
          loc.tags?.some((t) => t.toLowerCase().includes(lower)),
      );
    }
    return items;
  }, [allLocations, filter, search]);

  const missingCount = useMemo(
    () => allLocations.filter((loc) => !loc.referenceImageUrl).length,
    [allLocations],
  );

  async function handleRegenerateMissing() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/extract/regenerate-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "locations" }),
      });
      const data = await res.json();
      if (data.success) {
        notify.success(`Regenerated ${data.succeeded} of ${data.total} locations`);
        if (data.failed > 0) {
          notify.error(`${data.failed} failed to regenerate`);
        }
        queryClient.invalidateQueries({ queryKey: ["locations"] });
      } else {
        notify.error(data.error || "Failed to regenerate");
      }
    } catch {
      notify.error("Failed to regenerate missing images");
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/locations/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Location deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["locations"] });
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete location");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Locations</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {allLocations.length} locations
          </p>
        </div>
        <div className="flex gap-2">
          {missingCount > 0 && (
            <Button
              variant="outline"
              onClick={handleRegenerateMissing}
              disabled={isRegenerating}
            >
              <FontAwesomeIcon
                icon={faRotate}
                className={`mr-2 h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`}
              />
              {isRegenerating
                ? "Regenerating..."
                : `Regenerate Missing (${missingCount})`}
            </Button>
          )}
          <input
            type="file"
            accept="image/*"
            id="location-upload"
            className="hidden"
            onChange={handleUploadForExtraction}
          />
          <Button onClick={() => document.getElementById("location-upload")?.click()}>
            <FontAwesomeIcon icon={faUpload} className="mr-2 h-4 w-4" />
            Extract from Image
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search by name or tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">No locations found</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onView={() => appNavigate(`/locations/${location.id}`)}
              onDelete={() => setDeleteTarget(location)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Location"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <ExtractionReviewModal
        open={extractionOpen}
        onOpenChange={(open) => {
          setExtractionOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ["locations"] });
        }}
        imageUrl={extractionImageUrl}
        sourceBookId=""
        sourcePageId=""
      />
    </div>
  );
}

// --- LocationCard sub-component ---

function LocationCard({
  location,
  onView,
  onDelete,
}: {
  location: LocationEntity;
  onView: () => void;
  onDelete: () => void;
}) {
  const mood = location.atmosphere?.mood?.toLowerCase() || "";

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Reference image */}
      <div className="relative aspect-[4/3] bg-muted">
        {location.referenceImageUrl ? (
          <img
            src={resolveUrl(location.referenceImageUrl)}
            alt={location.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <FontAwesomeIcon icon={faMapPin} className="h-12 w-12 opacity-30" />
          </div>
        )}
        {/* Mood badge overlay */}
        {mood && (
          <div className="absolute top-2 right-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${MOOD_COLORS[mood] || "bg-gray-100 text-gray-600"}`}
            >
              {mood}
            </span>
          </div>
        )}
      </div>

      {/* Card content */}
      <CardContent className="p-3">
        <p className="truncate text-sm font-semibold">{location.name}</p>
        {/* Props preview */}
        {location.props?.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {location.props.slice(0, 3).join(", ")}
            {location.props.length > 3 && ` +${location.props.length - 3}`}
          </p>
        )}
        {/* Tags */}
        {location.tags?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {location.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            {location.tags.length > 4 && (
              <Badge variant="outline" className="text-[10px]">
                +{location.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
        {/* Actions */}
        <div className="mt-2 flex justify-end">
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
            >
              <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
