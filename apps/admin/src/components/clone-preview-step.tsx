"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/pro-regular-svg-icons";
import type { CloneJobPage } from "@/lib/ai/clone-types";

interface ClonePreviewStepProps {
  pages: CloneJobPage[];
  onNext: (selectedPages: number[]) => void;
  onBack: () => void;
}

export function ClonePreviewStep({ pages, onNext, onBack }: ClonePreviewStepProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(pages.map((p) => p.pageNumber)));

  const togglePage = (pageNum: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selected.size} of {pages.length} pages selected for analysis
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setSelected(new Set(pages.map((p) => p.pageNumber)))}
            className="text-xs text-primary hover:underline"
          >
            Select all
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:underline"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Page grid */}
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {pages.map((page) => {
          const isSelected = selected.has(page.pageNumber);
          return (
            <button
              key={page.pageNumber}
              onClick={() => togglePage(page.pageNumber)}
              className={`group relative aspect-[3/4] overflow-hidden rounded-md border-2 transition-all ${
                isSelected ? "border-primary ring-1 ring-primary" : "border-transparent opacity-50"
              }`}
            >
              <img
                src={page.imageUrl}
                alt={`Page ${page.pageNumber}`}
                className="h-full w-full object-cover"
              />
              {/* Page number badge */}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {page.pageNumber}
              </span>
              {/* Selection indicator */}
              <span
                className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <FontAwesomeIcon icon={isSelected ? faCheck : faXmark} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={() => onNext(Array.from(selected).sort((a, b) => a - b))}
          disabled={selected.size === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Analyze {selected.size} Pages
        </button>
      </div>
    </div>
  );
}
