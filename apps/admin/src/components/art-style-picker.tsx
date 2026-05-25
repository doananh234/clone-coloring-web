"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Badge, Input, Dialog, DialogContent } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPalette, faXmark, faMagnifyingGlass } from "@fortawesome/pro-regular-svg-icons";
import type { ArtStyleEntity } from "@/lib/ai/art-style-types";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

interface ArtStylePickerProps {
  value: string | null;
  onChange: (artStyleId: string | null, artStyle: ArtStyleEntity | null) => void;
}

/** Compact art style picker with browse-modal for the Story Planner step. */
export function ArtStylePicker({ value, onChange }: ArtStylePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: result } = useQuery({
    queryKey: ["artStyles"],
    queryFn: () => fetch("/api/art-styles").then((r) => r.json()),
  });
  const artStyles: ArtStyleEntity[] = result?.data ?? [];

  const selected = useMemo(() => artStyles.find((s) => s.id === value) ?? null, [artStyles, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return artStyles;
    const q = search.toLowerCase();
    return artStyles.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.moodAndAtmosphere.mood.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [artStyles, search]);

  const handleSelect = (style: ArtStyleEntity) => {
    onChange(style.id, style);
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange(null, null);
  };

  return (
    <>
      {/* Trigger / preview */}
      {selected ? (
        <SelectedPreview
          style={selected}
          onChangClick={() => setOpen(true)}
          onClear={handleClear}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setOpen(true)}
        >
          <FontAwesomeIcon icon={faPalette} />
          Select Art Style
        </Button>
      )}

      {/* Browse modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Choose Art Style</h2>

          {/* Search */}
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4"
            />
            <Input
              placeholder="Search styles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Grid */}
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((style) => (
                <ArtStyleGridItem
                  key={style.id}
                  style={style}
                  isSelected={style.id === value}
                  onClick={() => handleSelect(style)}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No art styles found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Sub-components ---------- */

function SelectedPreview({
  style,
  onChangClick,
  onClear,
}: {
  style: ArtStyleEntity;
  onChangClick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {style.thumbnailUrl ? (
        <img
          src={resolveUrl(style.thumbnailUrl)}
          alt={style.name}
          className="size-12 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="size-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <FontAwesomeIcon icon={faPalette} className="text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{style.name}</p>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {style.moodAndAtmosphere.mood && (
            <Badge variant="secondary" className="text-xs">
              {style.moodAndAtmosphere.mood}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {style.technical.complexityScore}/10
          </Badge>
        </div>
      </div>

      <div className="flex gap-1 flex-shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onChangClick}>
          Change
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClear}>
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </div>
    </div>
  );
}

function ArtStyleGridItem({
  style,
  isSelected,
  onClick,
}: {
  style: ArtStyleEntity;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-2 text-left transition hover:border-primary hover:bg-accent/50 ${
        isSelected ? "border-primary ring-2 ring-primary/30" : ""
      }`}
    >
      {style.thumbnailUrl ? (
        <img
          src={resolveUrl(style.thumbnailUrl)}
          alt={style.name}
          className="aspect-square w-full rounded object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded bg-muted flex items-center justify-center">
          <FontAwesomeIcon icon={faPalette} className="text-muted-foreground size-8" />
        </div>
      )}
      <p className="mt-1.5 text-sm font-medium truncate">{style.name}</p>
      {style.moodAndAtmosphere.mood && (
        <p className="text-xs text-muted-foreground truncate">{style.moodAndAtmosphere.mood}</p>
      )}
    </button>
  );
}
