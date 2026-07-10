"use client";
import React from "react";
import { cn } from "@vx/core-uikit/utils";
import { Label } from "@vx/core-uikit/components";
import type { StyleFilter } from "@vx/server-core/text-overlay";

interface StylePanelProps {
  filter: StyleFilter;
  onFilterChange: (f: StyleFilter) => void;
}

const FILTERS: Array<{ id: StyleFilter; label: string; preview: string }> = [
  { id: "none", label: "None", preview: "none" },
  { id: "vintage", label: "Vintage", preview: "sepia(0.3) saturate(0.8) contrast(0.9)" },
  { id: "warm", label: "Warm", preview: "saturate(1.15) brightness(1.05) sepia(0.1)" },
  { id: "cool", label: "Cool", preview: "saturate(1.1) hue-rotate(-15deg)" },
  { id: "monochrome", label: "Mono", preview: "grayscale(1)" },
  { id: "sepia", label: "Sepia", preview: "sepia(1)" },
  { id: "pastel", label: "Pastel", preview: "saturate(0.7) brightness(1.1) contrast(0.95)" },
];

export function StylePanel({ filter, onFilterChange }: StylePanelProps) {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-bold uppercase tracking-wide">Background filter</Label>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Preview is a client-side CSS approximation. The server export uses the same
        numeric parameters so the saved PNG matches what you see here.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "border-2 rounded-md p-2 flex flex-col items-center gap-1 transition",
              filter === f.id
                ? "border-primary ring-2 ring-primary/30"
                : "border-muted hover:border-primary/40",
            )}
          >
            <div
              className="w-full aspect-video rounded-sm bg-gradient-to-br from-orange-400 via-pink-500 to-blue-500"
              style={{ filter: f.preview }}
            />
            <span className="text-[11px] font-medium">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
