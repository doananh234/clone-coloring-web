"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Badge, Input, Dialog, DialogContent } from "@vx/core-uikit/components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDroplet, faXmark, faMagnifyingGlass } from "@fortawesome/pro-regular-svg-icons";
import type { ColoringStyleEntity } from "@/lib/ai/coloring-style-types";

const IMAGE_BASE_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "";
function resolveUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  if (IMAGE_BASE_URL) return `${IMAGE_BASE_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  return url;
}

interface ColoringStylePickerProps {
  value: string | null;
  onChange: (coloringStyleId: string | null, coloringStyle: ColoringStyleEntity | null) => void;
}

/** Compact coloring style picker with browse-modal. */
export function ColoringStylePicker({ value, onChange }: ColoringStylePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: result } = useQuery({
    queryKey: ["coloringStyles"],
    queryFn: () => fetch("/api/coloring-styles").then((r) => r.json()),
  });
  const coloringStyles: ColoringStyleEntity[] = result?.data ?? [];

  const selected = useMemo(
    () => coloringStyles.find((s) => s.id === value) ?? null,
    [coloringStyles, value],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return coloringStyles;
    const q = search.toLowerCase();
    return coloringStyles.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.medium.technique.toLowerCase().includes(q) ||
        s.overallFeel.mood.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [coloringStyles, search]);

  const handleSelect = (style: ColoringStyleEntity) => {
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
          onChangeClick={() => setOpen(true)}
          onClear={handleClear}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setOpen(true)}
        >
          <FontAwesomeIcon icon={faDroplet} />
          Select Coloring Style
        </Button>
      )}

      {/* Browse modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Choose Coloring Style</h2>

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
                <ColoringStyleGridItem
                  key={style.id}
                  style={style}
                  isSelected={style.id === value}
                  onClick={() => handleSelect(style)}
                />
              ))}
            </div>
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No coloring styles found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Sub-components ---------- */

/** Mini color swatches row from primaryColors array. */
function ColorSwatches({ colors }: { colors: string[] }) {
  const display = colors.slice(0, 4);
  if (display.length === 0) return null;
  return (
    <div className="flex gap-1 mt-0.5">
      {display.map((color, i) => (
        <span
          key={i}
          className="inline-block size-3.5 rounded-full border border-white/50 shadow-sm"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function SelectedPreview({
  style,
  onChangeClick,
  onClear,
}: {
  style: ColoringStyleEntity;
  onChangeClick: () => void;
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
          <FontAwesomeIcon icon={faDroplet} className="text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{style.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <ColorSwatches colors={style.colorPalette?.primaryColors ?? []} />
          {style.medium.technique && (
            <Badge variant="secondary" className="text-xs">
              {style.medium.technique}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex gap-1 flex-shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onChangeClick}>
          Change
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClear}>
          <FontAwesomeIcon icon={faXmark} />
        </Button>
      </div>
    </div>
  );
}

function ColoringStyleGridItem({
  style,
  isSelected,
  onClick,
}: {
  style: ColoringStyleEntity;
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
          <FontAwesomeIcon icon={faDroplet} className="text-muted-foreground size-8" />
        </div>
      )}
      <p className="mt-1.5 text-sm font-medium truncate">{style.name}</p>
      <ColorSwatches colors={style.colorPalette?.primaryColors ?? []} />
    </button>
  );
}
