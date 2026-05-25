"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Badge, Input, Card, CardContent } from "@vx/core-uikit/components";
import { ConfirmDialog } from "@vx/core-uikit/components";
import { notify } from "@vx/core-uikit/notifications";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

import {
  faDroplet,
  faMagnifyingGlass,
  faEye,
  faTrash,
  faPlus,
  faSparkles,
} from "@fortawesome/pro-regular-svg-icons";
import { appNavigate } from "@/lib/navigate";
import type { ColoringStyleEntity } from "@/lib/ai/coloring-style-types";

// --- Component ---

export function ColoringStyleListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ColoringStyleEntity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["coloringStyles"],
    queryFn: () => fetch("/api/coloring-styles").then((r) => r.json()),
  });

  const allStyles: ColoringStyleEntity[] = result?.data ?? [];

  const filtered = useMemo(() => {
    if (!search) return allStyles;
    const lower = search.toLowerCase();
    return allStyles.filter(
      (s) =>
        s.name?.toLowerCase().includes(lower) ||
        s.tags?.some((t) => t.toLowerCase().includes(lower)) ||
        s.overallFeel?.mood?.toLowerCase().includes(lower),
    );
  }, [allStyles, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/coloring-styles/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        notify.success("Coloring style deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["coloringStyles"] });
      } else {
        notify.error(data.error || "Failed to delete");
      }
    } catch {
      notify.error("Failed to delete coloring style");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coloring Styles</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {allStyles.length} coloring styles
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => appNavigate("/coloring-styles/new?mode=extract")}
          >
            <FontAwesomeIcon icon={faSparkles} className="mr-2 h-4 w-4" />
            Extract from Image
          </Button>
          <Button onClick={() => appNavigate("/coloring-styles/new")}>
            <FontAwesomeIcon icon={faPlus} className="mr-2 h-4 w-4" />
            Create New
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
          placeholder="Search by name, tags, or mood..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <FontAwesomeIcon icon={faDroplet} className="h-12 w-12 opacity-30" />
          <p>No coloring styles found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((style) => (
            <ColoringStyleCard
              key={style.id}
              style={style}
              onView={() => appNavigate(`/coloring-styles/${style.id}`)}
              onDelete={() => setDeleteTarget(style)}
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
        title="Delete Coloring Style"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// --- ColoringStyleCard sub-component ---

function ColoringStyleCard({
  style,
  onView,
  onDelete,
}: {
  style: ColoringStyleEntity;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onView}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-muted">
        {style.thumbnailUrl ? (
          <img
            src={resolveUrl(style.thumbnailUrl)}
            alt={style.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <FontAwesomeIcon icon={faDroplet} className="h-12 w-12 opacity-30" />
          </div>
        )}
        {/* Badges overlay */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {style.medium?.technique && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {style.medium.technique}
            </span>
          )}
          {style.overallFeel?.mood && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
              {style.overallFeel.mood}
            </span>
          )}
        </div>
        {/* Mini color swatches */}
        {style.colorPalette?.primaryColors?.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-0.5">
            {style.colorPalette.primaryColors.slice(0, 4).map((color, i) => (
              <span
                key={i}
                className="inline-block h-3 w-3 rounded-full border border-white/50"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card content */}
      <CardContent className="p-3">
        <p className="truncate text-sm font-semibold">{style.name}</p>
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
